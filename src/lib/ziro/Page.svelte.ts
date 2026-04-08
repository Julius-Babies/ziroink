import {generateKeyBetween} from "fractional-indexing";
import type {Block} from "$lib/ziro/Block";
import {type BaseInline, InlineText, TextBlock, type ListStyle} from "$lib/ziro/TextBlock.svelte";
import {DocumentFactory} from "$lib/ziro/DocumentFactory.svelte";
import type {PageEvent, StyleType} from "$lib/ziro/Events";

export type Selection = {
    isBlockSelection: boolean;
    start: SelectionPosition;
    end: SelectionPosition | null;
}

export type NonCollapsedSelection = {
    isBlockSelection: boolean;
    start: SelectionPosition;
    end: SelectionPosition;
}

export function isNonCollapsedSelection(selection: null | Selection): selection is NonCollapsedSelection {
    return selection !== null && selection.end !== null;
}

export class Page {
    blocks: Block[] = $state([]);
    selection: null | Selection = $state(null);
    cursorXPosition: number | null = $state(null);
    eventQueue: PageEvent[] = $state([]);

    factory = new DocumentFactory();

    private subscribers: ((event: PageEvent) => void)[] = [];

    subscribe(callback: (event: PageEvent) => void) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(s => s !== callback);
        };
    }

    getSelectedBlocks(selection: NonCollapsedSelection): Block[] {
        const startIdx = this.blocks.findIndex(b => b.id === selection.start.blockId);
        const endIdx = this.blocks.findIndex(b => b.id === selection.end.blockId);
        if (startIdx === -1 || endIdx === -1) return [];

        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);

        return this.blocks.slice(minIdx, maxIdx + 1);
    }

    private emit(event: PageEvent) {
        this.eventQueue.push(event);
        for (const subscriber of this.subscribers) {
            subscriber(event);
        }
    }

    clearEventQueue() {
        this.eventQueue = [];
    }

    updateBlockIndent(blockId: string, delta: number) {
        if (this.blocks.length > 0 && this.blocks[0].id === blockId) return; // Title block cannot be indented
        
        const block = this.blocks.find(b => b.id === blockId);
        if (!block) return;
        const oldIndent = block.indentLevel;
        block.indentLevel = Math.max(0, Math.min(4, block.indentLevel + delta));
        this.emit({
            type: "block_indent_changed",
            blockId,
            oldIndent: oldIndent,
            newIndent: block.indentLevel
        });
    }

    updateBlockList(blockId: string, listType: "unordered" | "ordered" | null, listStyle: ListStyle | null) {
        if (this.blocks.length > 0 && this.blocks[0].id === blockId) return; // Title block cannot be a list

        const block = this.blocks.find(b => b.id === blockId);
        if (block && block instanceof TextBlock) {
            const oldListType = block.listType;
            const oldListStyle = block.listStyle;
            block.listType = listType;
            block.listStyle = listStyle;
            if (listType && block.indentLevel === 0) {
                block.indentLevel = 1;
            }
            this.emit({
                type: "block_list_changed",
                blockId,
                oldListType,
                newListType: listType,
                oldListStyle,
                newListStyle: listStyle
            });
        }
    }

    updateBlockVariant(blockId: string, variant: "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
        if (this.blocks.length > 0 && this.blocks[0].id === blockId) return; // Title block variant cannot be changed

        const block = this.blocks.find(b => b.id === blockId);
        if (block && block instanceof TextBlock) {
            const oldVariant = block.variant;
            block.variant = variant;
            this.emit({
                type: "block_variant_changed",
                blockId,
                oldVariant,
                newVariant: variant
            });
        }
    }

    insertBlock(block: Block, position: { type: "after_block", afterId: string } | { type: "end" }) {
        if (position.type === "after_block") {
            const index = this.blocks.findIndex(b => b.id === position.afterId);
            if (index === -1) {
                throw new Error("Failed to find block with id " + position.afterId);
            }

            const prevKey = this.blocks[index].sortKey;
            const nextKey = index + 1 < this.blocks.length ? this.blocks[index + 1].sortKey : null;
            block.sortKey = generateKeyBetween(prevKey, nextKey);

            this.blocks = [...this.blocks.slice(0, index + 1), block, ...this.blocks.slice(index + 1)]
            this.emit({ type: "block_inserted", blockId: block.id, position, blockData: block.toObject() });
            return;
        } else if (position.type === "end") {
            const prevKey = this.blocks.length > 0 ? this.blocks[this.blocks.length - 1].sortKey : null;
            block.sortKey = generateKeyBetween(prevKey, null);

            this.blocks = [...this.blocks, block]
            this.emit({ type: "block_inserted", blockId: block.id, position, blockData: block.toObject() });
        }
    }

    setBlocks(blocks: Block[]) {
        this.blocks = blocks;
        this.emit({ type: "blocks_set", blockIds: blocks.map(b => b.id) });
    }

    splitBlock(blockId: string, offset: number): { oldBlockId: string, newBlockId: string } {
        const blockIndex = this.blocks.findIndex(b => b.id === blockId);
        if (blockIndex === -1) {
            throw new Error("Failed to find block with id " + blockId);
        }

        const block = this.blocks[blockIndex];
        if (!(block instanceof TextBlock)) {
            throw new Error("Cannot split non-text block");
        }

        const newBlock = this.factory.createTextBlock();
        newBlock.indentLevel = block.indentLevel;
        newBlock.listType = block.listType;
        newBlock.listStyle = block.listStyle ? {...block.listStyle} : null;
        if (newBlock.listStyle?.type === "checkbox") newBlock.listStyle.checked = false;

        const inlineAtCursor = block.findInlineAtOffset(offset);
        const inlineIndex = block.inlines.indexOf(inlineAtCursor.inline);

        if (inlineAtCursor.inline instanceof InlineText) {
            const textBeforeCursor = inlineAtCursor.inline.content.slice(0, inlineAtCursor.offsetInInline);
            const textAfterCursor = inlineAtCursor.inline.content.slice(inlineAtCursor.offsetInInline);

            if (textAfterCursor !== "") {
                const newBaseInline = this.factory.createInlineText();
                newBaseInline.content = textAfterCursor;
                InlineText.prototype.isSameStyleAs.call(newBaseInline, inlineAtCursor.inline);
                newBaseInline.bold = (inlineAtCursor.inline as InlineText).bold;
                newBaseInline.italic = (inlineAtCursor.inline as InlineText).italic;
                newBaseInline.underline = (inlineAtCursor.inline as InlineText).underline;
                newBaseInline.strikethrough = (inlineAtCursor.inline as InlineText).strikethrough;
                newBaseInline.code = (inlineAtCursor.inline as InlineText).code;
                newBlock.inlines = [...newBlock.inlines, newBaseInline];
            }

            newBlock.inlines = [...newBlock.inlines, ...block.inlines.slice(inlineIndex + 1)];
            block.inlines = block.inlines.slice(0, inlineIndex + 1);
            (inlineAtCursor.inline as InlineText).content = textBeforeCursor;
        } else {
            newBlock.inlines = [...block.inlines.slice(inlineIndex + 1)];
            block.inlines = block.inlines.slice(0, inlineIndex + 1);
        }

        if (newBlock.inlines.length === 0) {
            const emptyInline = this.factory.createInlineText();
            emptyInline.sortKey = generateKeyBetween(null, null);
            newBlock.inlines = [emptyInline];
        } else {
            // Assign sort keys to the inlines of the new block
            let prevKey = null;
            for (const inl of newBlock.inlines) {
                inl.sortKey = generateKeyBetween(prevKey, null);
                prevKey = inl.sortKey;
            }
        }

        block._mergeAdjacentBaseInlines();
        
        const blockPrevKey = block.sortKey;
        const blockNextKey = blockIndex + 1 < this.blocks.length ? this.blocks[blockIndex + 1].sortKey : null;
        newBlock.sortKey = generateKeyBetween(blockPrevKey, blockNextKey);

        this.blocks = [...this.blocks.slice(0, blockIndex + 1), newBlock, ...this.blocks.slice(blockIndex + 1)];

        this.emit({
            type: "block_split",
            oldBlockId: blockId,
            newBlockId: newBlock.id,
            splitOffset: offset
        });

        return { oldBlockId: blockId, newBlockId: newBlock.id };
    }

    mergeBlocks(targetBlockId: string, sourceBlockId: string) {
        const targetIndex = this.blocks.findIndex(b => b.id === targetBlockId);
        if (targetIndex === -1) {
            throw new Error("Failed to find target block with id " + targetBlockId);
        }

        const targetBlock = this.blocks[targetIndex];
        const sourceBlock = this.blocks.find(b => b.id === sourceBlockId);

        if (!sourceBlock) {
            throw new Error("Failed to find source block with id " + sourceBlockId);
        }

        if (!(targetBlock instanceof TextBlock) || !(sourceBlock instanceof TextBlock)) {
            throw new Error("Can only merge text blocks");
        }

        const targetContentLength = targetBlock.getContentLength();
        targetBlock.inlines = [...targetBlock.inlines, ...sourceBlock.inlines];
        targetBlock._mergeAdjacentBaseInlines();

        this.blocks = this.blocks.filter(b => b.id !== sourceBlockId);

        this.emit({
            type: "block_merged",
            targetBlockId,
            sourceBlockId
        });

        return targetContentLength;
    }

    createEmptyBlockAtEnd(): string {
        const block = this.factory.createTextBlock();
        const inline = this.factory.createInlineText();
        inline.content = "";
        inline.sortKey = generateKeyBetween(null, null);
        block.inlines = [inline];
        this.insertBlock(block, { type: "end" });
        return block.id;
    }
    findBlock(predicate: (block: Block) => boolean) {
        return this.blocks.find(predicate);
    }

    setSelection(start: SelectionPosition, end: SelectionPosition | null, isBlockSelection: boolean = false) {
        this.selection = { start: start, end: end, isBlockSelection: isBlockSelection };
        this.emit({
            type: "selection_changed",
            start,
            end
        });
    }

    getNormalizedSelection(selection: Selection | null = this.selection): { start: SelectionPosition, end: SelectionPosition } | null {
        if (!selection || !selection.end) return null;

        const pos1 = selection.start;
        const pos2 = selection.end;

        const idx1 = this.blocks.findIndex(b => b.id === pos1.blockId);
        const idx2 = this.blocks.findIndex(b => b.id === pos2.blockId);

        if (idx1 < idx2) return { start: pos1, end: pos2 };
        if (idx1 > idx2) return { start: pos2, end: pos1 };

        return pos1.offset <= pos2.offset
            ? { start: pos1, end: pos2 }
            : { start: pos2, end: pos1 };
    }

    toggleStyle(
        style: "bold" | "italic" | "underline" | "strikethrough" | "code",
        config: {
            forceTo: boolean | null,
            onSelection: NonCollapsedSelection
        }
    ) {
        const sel = this.getNormalizedSelection(config.onSelection);
        if (!sel) return;

        const startIdx = this.blocks.findIndex(b => b.id === sel.start.blockId);
        const endIdx = this.blocks.findIndex(b => b.id === sel.end.blockId);
        if (startIdx === -1 || endIdx === -1) return;

        let allHaveStyle = true;
        for (let i = startIdx; i <= endIdx; i++) {
            const block = this.blocks[i];
            if (!(block instanceof TextBlock)) continue;

            const isFirst = i === startIdx;
            const isLast = i === endIdx;
            const startOffset = isFirst ? sel.start.offset : 0;
            const endOffset = isLast ? sel.end.offset : block.getContentLength();

            if (startOffset === endOffset) continue;

            const inlineStart = block.findInlineAtOffset(startOffset);
            const inlineEnd = block.findInlineAtOffset(endOffset);

            const startBaseInlineIdx = block.inlines.findIndex(inl => inlineStart.inline.id === inl.id);
            const endBaseInlineIdx = block.inlines.findIndex(inl => inlineEnd.inline.id === inl.id);

            for (let j = startBaseInlineIdx; j <= endBaseInlineIdx; j++) {
                const inline = block.inlines[j];
                const length = inline instanceof InlineText ? inline.content.length : 1;

                if (j === endBaseInlineIdx && inlineEnd.offsetInInline === 0 && j > startBaseInlineIdx) {
                    continue;
                }
                if (j === startBaseInlineIdx && inlineStart.offsetInInline === length && j < endBaseInlineIdx) {
                    continue;
                }

                if (inline instanceof InlineText) {
                    if (!inline[style]) {
                        allHaveStyle = false;
                        break;
                    }
                }
            }
            if (!allHaveStyle) break;
        }

        const targetValue = config.forceTo ?? !allHaveStyle;

        for (let i = startIdx; i <= endIdx; i++) {
            const block = this.blocks[i];
            if (!(block instanceof TextBlock)) continue;

            const isFirst = i === startIdx;
            const isLast = i === endIdx;
            const startOffset = isFirst ? sel.start.offset : 0;
            const endOffset = isLast ? sel.end.offset : block.getContentLength();

            if (startOffset === endOffset) continue;

            this.applyStyleToBlockRange(block, startOffset, endOffset, style, targetValue);
            this.emit({
                type: "style_toggled",
                blockId: block.id,
                startOffset,
                endOffset,
                style,
                value: targetValue
            });
        }
    }

    private applyStyleToBlockRange(block: TextBlock, startOffset: number, endOffset: number, style: StyleType, value: boolean) {
        const inlineStart = block.findInlineAtOffset(startOffset);
        const inlineEnd = block.findInlineAtOffset(endOffset);

        const startIdx = block.inlines.findIndex(inl => inlineStart.inline.id === inl.id);
        const endIdx = block.inlines.findIndex(inl => inlineEnd.inline.id === inl.id);

        let newInlines = [];
        let currentKey = startIdx > 0 ? block.inlines[startIdx - 1].sortKey : null;

        for (let i = 0; i < block.inlines.length; i++) {
            const inline = block.inlines[i];
            if (!(inline instanceof InlineText)) {
                if (i >= startIdx) {
                    currentKey = inline.sortKey = generateKeyBetween(currentKey, null);
                }
                newInlines.push(inline);
                continue;
            }

            if (i < startIdx || i > endIdx) {
                if (i > endIdx) {
                    currentKey = inline.sortKey = generateKeyBetween(currentKey, null);
                }
                newInlines.push(inline);
                continue;
            }

            if (i === startIdx && i === endIdx) {
                const p1 = inline.content.substring(0, inlineStart.offsetInInline);
                const p2 = inline.content.substring(inlineStart.offsetInInline, inlineEnd.offsetInInline);
                const p3 = inline.content.substring(inlineEnd.offsetInInline);

                if (p1) {
                    const inl1 = this.factory.createInlineText();
                    inl1.content = p1;
                    inl1.copyStylesFrom(inline);
                    currentKey = inl1.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl1);
                }
                if (p2) {
                    const inl2 = this.factory.createInlineText();
                    inl2.content = p2;
                    inl2.copyStylesFrom(inline);
                    inl2[style] = value;
                    currentKey = inl2.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl2);
                }
                if (p3) {
                    const inl3 = this.factory.createInlineText();
                    inl3.content = p3;
                    inl3.copyStylesFrom(inline);
                    currentKey = inl3.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl3);
                }
            } else if (i === startIdx) {
                const p1 = inline.content.substring(0, inlineStart.offsetInInline);
                const p2 = inline.content.substring(inlineStart.offsetInInline);

                if (p1) {
                    const inl1 = this.factory.createInlineText();
                    inl1.content = p1;
                    inl1.copyStylesFrom(inline);
                    currentKey = inl1.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl1);
                }
                if (p2) {
                    const inl2 = this.factory.createInlineText();
                    inl2.content = p2;
                    inl2.copyStylesFrom(inline);
                    inl2[style] = value;
                    currentKey = inl2.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl2);
                }
            } else if (i === endIdx) {
                const p1 = inline.content.substring(0, inlineEnd.offsetInInline);
                const p2 = inline.content.substring(inlineEnd.offsetInInline);

                if (p1) {
                    const inl1 = this.factory.createInlineText();
                    inl1.content = p1;
                    inl1.copyStylesFrom(inline);
                    inl1[style] = value;
                    currentKey = inl1.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl1);
                }
                if (p2) {
                    const inl2 = this.factory.createInlineText();
                    inl2.content = p2;
                    inl2.copyStylesFrom(inline);
                    currentKey = inl2.sortKey = generateKeyBetween(currentKey, null);
                    newInlines.push(inl2);
                }
            } else {
                const inl = this.factory.createInlineText();
                inl.content = inline.content;
                inl.copyStylesFrom(inline);
                inl[style] = value;
                currentKey = inl.sortKey = generateKeyBetween(currentKey, null);
                newInlines.push(inl);
            }
        }

        block.inlines = newInlines;
        block._mergeAdjacentBaseInlines();
    }

    insertInlineAtOffset(blockId: string, offset: number, inline: BaseInline) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block || !(block instanceof TextBlock)) return;

        const { inline: targetBaseInline, offsetInInline } = block.findInlineAtOffset(offset);
        const index = block.inlines.findIndex(i => i.id === targetBaseInline.id);

        if (targetBaseInline instanceof InlineText) {
            const textBefore = targetBaseInline.content.slice(0, offsetInInline);
            const textAfter = targetBaseInline.content.slice(offsetInInline);
            
            targetBaseInline.content = textBefore;
            const afterBaseInline = this.factory.createInlineText();
            afterBaseInline.content = textAfter;
            afterBaseInline.copyStylesFrom(targetBaseInline);
            
            inline.sortKey = generateKeyBetween(targetBaseInline.sortKey, null);
            afterBaseInline.sortKey = generateKeyBetween(inline.sortKey, null);

            block.inlines = [
                ...block.inlines.slice(0, index + 1),
                inline,
                ...(textAfter ? [afterBaseInline] : []),
                ...block.inlines.slice(index + 1)
            ];
            
            // Recalculate sort keys for remaining to keep them ordered, or we can just regenerate keys for the split items correctly
            // Actually, afterBaseInline should be between inline and the NEXT original inline
            const nextOriginalInline = block.inlines[index + (textAfter ? 3 : 2)];
            const nextKey = nextOriginalInline ? nextOriginalInline.sortKey : null;
            
            inline.sortKey = generateKeyBetween(targetBaseInline.sortKey, nextKey);
            if (textAfter) {
                afterBaseInline.sortKey = generateKeyBetween(inline.sortKey, nextKey);
            }
            
        } else {
            const prevKey = index > 0 ? block.inlines[index - 1].sortKey : null;
            const nextKey = targetBaseInline.sortKey;
            
            if (offsetInInline === 0) {
                inline.sortKey = generateKeyBetween(prevKey, nextKey);
                block.inlines = [
                    ...block.inlines.slice(0, index),
                    inline,
                    ...block.inlines.slice(index)
                ];
            } else {
                const afterNextKey = index + 1 < block.inlines.length ? block.inlines[index + 1].sortKey : null;
                inline.sortKey = generateKeyBetween(targetBaseInline.sortKey, afterNextKey);
                block.inlines = [
                    ...block.inlines.slice(0, index + 1),
                    inline,
                    ...block.inlines.slice(index + 1)
                ];
            }
        }
        
        const newIndex = block.inlines.findIndex(i => i.id === inline.id);
        if (newIndex === block.inlines.length - 1 || !(block.inlines[newIndex + 1] instanceof InlineText)) {
            const emptyInline = this.factory.createInlineText();
            const nextKey = newIndex + 1 < block.inlines.length ? block.inlines[newIndex + 1].sortKey : null;
            emptyInline.sortKey = generateKeyBetween(inline.sortKey, nextKey);
            block.inlines.splice(newIndex + 1, 0, emptyInline);
        }

        this.emit({
            type: "inline_inserted",
            blockId,
            inline,
            offset
        });
    }

    insertText(position: SelectionPosition, text: string) {
        const block = this.blocks.find(b => b.id === position.blockId);
        if (!block || !(block instanceof TextBlock)) return;

        if (block.inlines.length === 0) {
            const newBaseInline = this.factory.createInlineText();
            newBaseInline.content = text;
            newBaseInline.sortKey = generateKeyBetween(null, null);
            block.inlines = [newBaseInline];
            this.emit({ type: "text_inserted", blockId: position.blockId, offset: 0, text });
            return;
        }

        const contentLength = block.getContentLength();
        if (position.offset === contentLength) {
            const lastBaseInline = block.inlines[block.inlines.length - 1];
            if (lastBaseInline instanceof InlineText) {
                lastBaseInline.content += text;
            } else {
                const newBaseInline = this.factory.createInlineText();
                newBaseInline.content = text;
                newBaseInline.sortKey = generateKeyBetween(lastBaseInline.sortKey, null);
                block.inlines = [...block.inlines, newBaseInline];
            }
            this.emit({ type: "text_inserted", blockId: position.blockId, offset: position.offset, text });
            return;
        }

        const { inline, offsetInInline } = block.findInlineAtOffset(position.offset);
        if (inline instanceof InlineText) {
            inline.content = inline.content.substring(0, offsetInInline) + text + inline.content.slice(offsetInInline);
        } else {
            const newBaseInline = this.factory.createInlineText();
            newBaseInline.content = text;
            const index = block.inlines.findIndex(i => i.id === inline.id);
            const prevKey = index > 0 ? block.inlines[index - 1].sortKey : null;
            newBaseInline.sortKey = generateKeyBetween(prevKey, inline.sortKey);
            block.inlines = [...block.inlines.slice(0, index), newBaseInline, ...block.inlines.slice(index)];
        }

        this.emit({ type: "text_inserted", blockId: position.blockId, offset: position.offset, text });
    }
    deleteContent(start: SelectionPosition, end: SelectionPosition, isBlockSelection: boolean = false) {
        const startBlock = this.blocks.find(block => block.id === start.blockId);
        const endBlock = this.blocks.find(block => block.id === end.blockId);

        if (!startBlock || !endBlock) return;

        if (isBlockSelection) {
            const startIndex = this.blocks.findIndex(b => b.id === start.blockId);
            const endIndex = this.blocks.findIndex(b => b.id === end.blockId);
            let minIndex = Math.min(startIndex, endIndex);
            const maxIndex = Math.max(startIndex, endIndex);
            
            // Prevent deleting the headline block
            if (minIndex === 0) {
                minIndex = 1;
            }

            if (minIndex > maxIndex) {
                return;
            }
            
            const blocksToRemove = this.blocks.slice(minIndex, maxIndex + 1);
            for (const b of blocksToRemove) {
                this.emit({ type: "block_deleted", blockId: b.id });
            }
            this.blocks = [
                ...this.blocks.slice(0, minIndex),
                ...this.blocks.slice(maxIndex + 1),
            ];
            
            // If all content blocks are deleted, ensure at least one empty block exists
            if (this.blocks.length === 1) {
                this.createEmptyBlockAtEnd();
            }
            
            return;
        }

        if (start.blockId === end.blockId) {
            if (startBlock instanceof TextBlock) {
                const inlineStart = startBlock.findInlineAtOffset(start.offset);
                const inlineEnd = startBlock.findInlineAtOffset(end.offset);
                const startIdx = startBlock.inlines.findIndex(i => i.id === inlineStart.inline.id);
                const endIdx = startBlock.inlines.findIndex(i => i.id === inlineEnd.inline.id);

                if (startIdx === endIdx) {
                    if (inlineStart.inline instanceof InlineText) {
                        inlineStart.inline.content =
                            inlineStart.inline.content.substring(0, inlineStart.offsetInInline) +
                            inlineStart.inline.content.slice(inlineEnd.offsetInInline);
                    } else {
                        startBlock.inlines = startBlock.inlines.filter(i => i.id !== inlineStart.inline.id);
                    }
                } else {
                    let keepStart: boolean;
                    if (inlineStart.inline instanceof InlineText) {
                        inlineStart.inline.content = inlineStart.inline.content.substring(0, inlineStart.offsetInInline);
                        keepStart = true;
                    } else {
                        keepStart = inlineStart.offsetInInline > 0;
                    }

                    let keepEnd: boolean;
                    if (inlineEnd.inline instanceof InlineText) {
                        inlineEnd.inline.content = inlineEnd.inline.content.slice(inlineEnd.offsetInInline);
                        keepEnd = true;
                    } else {
                        keepEnd = inlineEnd.offsetInInline === 0;
                    }

                    startBlock.inlines = [
                        ...startBlock.inlines.slice(0, startIdx + (keepStart ? 1 : 0)),
                        ...startBlock.inlines.slice(endIdx + (keepEnd ? 0 : 1)),
                    ];
                }
                
                if (startBlock.inlines.length === 0) {
                    const emptyInline = this.factory.createInlineText();
                    emptyInline.sortKey = generateKeyBetween(null, null);
                    startBlock.inlines = [emptyInline];
                } else {
                    startBlock._mergeAdjacentBaseInlines();
                }
            } else {
                this.blocks = this.blocks.filter(b => b.id !== startBlock.id);
                this.emit({ type: "block_deleted", blockId: startBlock.id });
            }
            this.emit({
                type: "text_deleted",
                blockId: start.blockId,
                startOffset: start.offset,
                endOffset: end.offset
            });
            return;
        }

        if (startBlock instanceof TextBlock) {
            const inlineToCut = startBlock.findInlineAtOffset(start.offset);
            const inlineToCutIndex = startBlock.inlines.findIndex(i => i.id === inlineToCut.inline.id);
            let keepCurrentBaseInline: boolean;
            if (inlineToCut.inline instanceof InlineText) {
                inlineToCut.inline.content = inlineToCut.inline.content.substring(0, inlineToCut.offsetInInline);
                keepCurrentBaseInline = inlineToCut.inline.content.length > 0;
            } else {
                keepCurrentBaseInline = inlineToCut.offsetInInline > 0;
            }
            startBlock.inlines = startBlock.inlines.slice(0, inlineToCutIndex + (keepCurrentBaseInline ? 1 : 0));
        }

        if (endBlock instanceof TextBlock) {
            const inlineToCut = endBlock.findInlineAtOffset(end.offset);
            const inlineToCutIndex = endBlock.inlines.findIndex(i => i.id === inlineToCut.inline.id);
            let keepCurrentBaseInline: boolean;
            if (inlineToCut.inline instanceof InlineText) {
                inlineToCut.inline.content = inlineToCut.inline.content.slice(inlineToCut.offsetInInline);
                keepCurrentBaseInline = inlineToCut.inline.content.length > 0;
            } else {
                keepCurrentBaseInline = inlineToCut.offsetInInline === 0;
            }
            endBlock.inlines = [
                ...(keepCurrentBaseInline ? [inlineToCut.inline] : []),
                ...endBlock.inlines.slice(inlineToCutIndex + 1),
            ];
        }

        const startIndex = this.blocks.findIndex(b => b.id === start.blockId);
        const endIndex = this.blocks.findIndex(b => b.id === end.blockId);

        if (endIndex - startIndex > 1) {
            const blocksToRemove = this.blocks.slice(startIndex + 1, endIndex);
            for (const b of blocksToRemove) {
                this.emit({ type: "block_deleted", blockId: b.id });
            }
            this.blocks = [
                ...this.blocks.slice(0, startIndex + 1),
                ...this.blocks.slice(endIndex),
            ];
        }

        if (startBlock instanceof TextBlock && endBlock instanceof TextBlock) {
            let prevKey = startBlock.inlines.length > 0 ? startBlock.inlines[startBlock.inlines.length - 1].sortKey : null;
            for (const inl of endBlock.inlines) {
                inl.sortKey = generateKeyBetween(prevKey, null);
                prevKey = inl.sortKey;
            }
            startBlock.inlines = [...startBlock.inlines, ...endBlock.inlines];
            
            if (startBlock.inlines.length === 0) {
                const emptyInline = this.factory.createInlineText();
                emptyInline.sortKey = generateKeyBetween(null, null);
                startBlock.inlines = [emptyInline];
            } else {
                startBlock._mergeAdjacentBaseInlines();
            }
            
            this.blocks = this.blocks.filter(b => b.id !== endBlock.id);
            this.emit({ type: "block_deleted", blockId: endBlock.id });
        } else if (!(startBlock instanceof TextBlock)) {
            this.blocks = this.blocks.filter(b => b.id !== startBlock.id);
            this.emit({ type: "block_deleted", blockId: startBlock.id });
        }

        this.emit({
            type: "text_deleted",
            blockId: start.blockId,
            startOffset: start.offset,
            endOffset: end.offset
        });
    }
}

export interface SelectionPosition {
    blockId: string;
    offset: number;
}
