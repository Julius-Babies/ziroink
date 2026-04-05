import type {Block} from "$lib/ziro/Block";
import {Inline, InlineText, type ListStyle, TextBlock} from "$lib/ziro/TextBlock.svelte";
import type {BlockInsertPosition, PageEvent, StyleType} from "$lib/ziro/Events";

export type Selection = {
    start: SelectionPosition;
    end: SelectionPosition | null;
}

export type NonCollapsedSelection = {
    start: SelectionPosition;
    end: SelectionPosition;
}

export function isNonCollapsedSelection(selection: null | Selection): selection is NonCollapsedSelection {
    return selection !== null && selection.end !== null;
}

export class Page {
    blocks: Block[] = $state([])
    selection: null | Selection = $state(null);
    cursorXPosition: number | null = $state(null);
    eventQueue: PageEvent[] = $state([]);

    private subscribers: ((event: PageEvent) => void)[] = [];

    subscribe(callback: (event: PageEvent) => void) {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(s => s !== callback);
        };
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
        const block = this.blocks.find(b => b.id === blockId);
        if (block && block instanceof TextBlock) {
            const oldIndent = block.indentLevel;
            block.indentLevel = Math.max(0, Math.min(4, block.indentLevel + delta));
            this.emit({
                type: "block_indent_changed",
                blockId,
                oldIndent: oldIndent,
                newIndent: block.indentLevel
            });
        }
    }

    updateBlockList(blockId: string, listType: "unordered" | "ordered" | null, listStyle: ListStyle | null) {
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

            this.blocks = [...this.blocks.slice(0, index + 1), block, ...this.blocks.slice(index + 1)]
            this.emit({ type: "block_inserted", blockId: block.id, position });
            return;
        } else if (position.type === "end") {
            this.blocks = [...this.blocks, block]
            this.emit({ type: "block_inserted", blockId: block.id, position });
        }
    }

    setBlocks(blocks: Block[]) {
        const oldIds = this.blocks.map(b => b.id);
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

        const newBlock = new TextBlock(crypto.randomUUID());
        newBlock.indentLevel = block.indentLevel;
        newBlock.listType = block.listType;
        newBlock.listStyle = block.listStyle;

        const inlineAtCursor = block.findInlineAtOffset(offset);
        const inlineIndex = block.inlines.indexOf(inlineAtCursor.inline);

        if (inlineAtCursor.inline instanceof InlineText) {
            const textBeforeCursor = inlineAtCursor.inline.content.slice(0, inlineAtCursor.offsetInInline);
            const textAfterCursor = inlineAtCursor.inline.content.slice(inlineAtCursor.offsetInInline);

            if (textAfterCursor !== "") {
                const newInline = new InlineText(crypto.randomUUID());
                newInline.content = textAfterCursor;
                InlineText.prototype.isSameStyleAs.call(newInline, inlineAtCursor.inline);
                newInline.bold = (inlineAtCursor.inline as InlineText).bold;
                newInline.italic = (inlineAtCursor.inline as InlineText).italic;
                newInline.underline = (inlineAtCursor.inline as InlineText).underline;
                newInline.strikethrough = (inlineAtCursor.inline as InlineText).strikethrough;
                newInline.code = (inlineAtCursor.inline as InlineText).code;
                newBlock.inlines = [...newBlock.inlines, newInline];
            }

            newBlock.inlines = [...newBlock.inlines, ...block.inlines.slice(inlineIndex + 1)];
            block.inlines = block.inlines.slice(0, inlineIndex + 1);
            (inlineAtCursor.inline as InlineText).content = textBeforeCursor;
        } else {
            newBlock.inlines = [...block.inlines.slice(inlineIndex + 1)];
            block.inlines = block.inlines.slice(0, inlineIndex + 1);
        }

        if (newBlock.inlines.length === 0) {
            newBlock.inlines = [new InlineText(crypto.randomUUID())];
        }

        block._mergeAdjacentInlines();

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
        targetBlock._mergeAdjacentInlines();

        this.blocks = this.blocks.filter(b => b.id !== sourceBlockId);

        this.emit({
            type: "block_merged",
            targetBlockId,
            sourceBlockId
        });

        return targetContentLength;
    }

    createEmptyBlockAtEnd(): string {
        const block = new TextBlock(crypto.randomUUID());
        const inline = new InlineText(crypto.randomUUID());
        inline.content = "";
        block.inlines = [inline];
        this.insertBlock(block, { type: "end" });
        return block.id;
    }

    insertInlinesIntoBlock(blockId: string, inlines: Inline[], atOffset: number) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block || !(block instanceof TextBlock)) return;

        const oldInlines = block.inlines.map(i => ({ id: i.id }));

        const { inline: targetInline, offsetInInline } = block.findInlineAtOffset(atOffset);
        const targetIndex = block.inlines.indexOf(targetInline);

        if (targetInline instanceof InlineText) {
            const textBefore = targetInline.content.substring(0, offsetInInline);
            const textAfter = targetInline.content.substring(offsetInInline);

            const newInlines: Inline[] = [];
            if (textBefore.length > 0) {
                const beforeInline = new InlineText(crypto.randomUUID());
                beforeInline.content = textBefore;
                beforeInline.bold = (targetInline as InlineText).bold;
                beforeInline.italic = (targetInline as InlineText).italic;
                beforeInline.underline = (targetInline as InlineText).underline;
                beforeInline.strikethrough = (targetInline as InlineText).strikethrough;
                beforeInline.code = (targetInline as InlineText).code;
                newInlines.push(beforeInline);
            }

            newInlines.push(...inlines);

            if (textAfter.length > 0) {
                const afterInline = new InlineText(crypto.randomUUID());
                afterInline.content = textAfter;
                afterInline.bold = (targetInline as InlineText).bold;
                afterInline.italic = (targetInline as InlineText).italic;
                afterInline.underline = (targetInline as InlineText).underline;
                afterInline.strikethrough = (targetInline as InlineText).strikethrough;
                afterInline.code = (targetInline as InlineText).code;
                newInlines.push(afterInline);
            }

            block.inlines = [
                ...block.inlines.slice(0, targetIndex),
                ...newInlines,
                ...block.inlines.slice(targetIndex + 1)
            ];
        } else {
            const insertIndex = offsetInInline === 0 ? targetIndex : targetIndex + 1;
            block.inlines = [
                ...block.inlines.slice(0, insertIndex),
                ...inlines,
                ...block.inlines.slice(insertIndex)
            ];
        }

        block._mergeAdjacentInlines();

        this.emit({
            type: "inlines_replaced",
            blockId,
            oldInlines,
            newInlines: block.inlines.map(i => ({ id: i.id }))
        });
    }

    findBlock(predicate: (block: Block) => boolean) {
        return this.blocks.find(predicate);
    }

    setSelection(start: SelectionPosition, end: SelectionPosition | null) {
        this.selection = { start: start, end: end };
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

            const startInlineIdx = block.inlines.findIndex(inl => inlineStart.inline.id === inl.id);
            const endInlineIdx = block.inlines.findIndex(inl => inlineEnd.inline.id === inl.id);

            for (let j = startInlineIdx; j <= endInlineIdx; j++) {
                if (j === endInlineIdx && inlineEnd.offsetInInline === 0 && j > startInlineIdx) {
                    continue;
                }

                const inline = block.inlines[j];
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

        for (let i = 0; i < block.inlines.length; i++) {
            const inline = block.inlines[i];
            if (!(inline instanceof InlineText)) {
                newInlines.push(inline);
                continue;
            }

            if (i < startIdx || i > endIdx) {
                newInlines.push(inline);
                continue;
            }

            if (i === startIdx && i === endIdx) {
                const p1 = inline.content.substring(0, inlineStart.offsetInInline);
                const p2 = inline.content.substring(inlineStart.offsetInInline, inlineEnd.offsetInInline);
                const p3 = inline.content.substring(inlineEnd.offsetInInline);

                if (p1) {
                    const inl1 = new InlineText(crypto.randomUUID());
                    inl1.content = p1;
                    this.copyStyles(inline, inl1);
                    newInlines.push(inl1);
                }
                if (p2) {
                    const inl2 = new InlineText(crypto.randomUUID());
                    inl2.content = p2;
                    this.copyStyles(inline, inl2);
                    inl2[style] = value;
                    newInlines.push(inl2);
                }
                if (p3) {
                    const inl3 = new InlineText(crypto.randomUUID());
                    inl3.content = p3;
                    this.copyStyles(inline, inl3);
                    newInlines.push(inl3);
                }
            } else if (i === startIdx) {
                const p1 = inline.content.substring(0, inlineStart.offsetInInline);
                const p2 = inline.content.substring(inlineStart.offsetInInline);

                if (p1) {
                    const inl1 = new InlineText(crypto.randomUUID());
                    inl1.content = p1;
                    this.copyStyles(inline, inl1);
                    newInlines.push(inl1);
                }
                if (p2) {
                    const inl2 = new InlineText(crypto.randomUUID());
                    inl2.content = p2;
                    this.copyStyles(inline, inl2);
                    inl2[style] = value;
                    newInlines.push(inl2);
                }
            } else if (i === endIdx) {
                const p1 = inline.content.substring(0, inlineEnd.offsetInInline);
                const p2 = inline.content.substring(inlineEnd.offsetInInline);

                if (p1) {
                    const inl1 = new InlineText(crypto.randomUUID());
                    inl1.content = p1;
                    this.copyStyles(inline, inl1);
                    inl1[style] = value;
                    newInlines.push(inl1);
                }
                if (p2) {
                    const inl2 = new InlineText(crypto.randomUUID());
                    inl2.content = p2;
                    this.copyStyles(inline, inl2);
                    newInlines.push(inl2);
                }
            } else {
                const inl = new InlineText(crypto.randomUUID());
                inl.content = inline.content;
                this.copyStyles(inline, inl);
                inl[style] = value;
                newInlines.push(inl);
            }
        }

        block.inlines = newInlines;
        block._mergeAdjacentInlines();
    }

    private copyStyles(from: InlineText, to: InlineText) {
        to.bold = from.bold;
        to.italic = from.italic;
        to.underline = from.underline;
        to.strikethrough = from.strikethrough;
        to.code = from.code;
    }

    insertInlineAtOffset(blockId: string, offset: number, inline: Inline) {
        const block = this.blocks.find(b => b.id === blockId);
        if (!block || !(block instanceof TextBlock)) return;

        const { inline: targetInline, offsetInInline } = block.findInlineAtOffset(offset);
        const index = block.inlines.findIndex(i => i.id === targetInline.id);

        if (targetInline instanceof InlineText) {
            const textBefore = targetInline.content.slice(0, offsetInInline);
            const textAfter = targetInline.content.slice(offsetInInline);
            
            targetInline.content = textBefore;
            const afterInline = new InlineText(crypto.randomUUID());
            afterInline.content = textAfter;
            this.copyStyles(targetInline, afterInline);

            block.inlines = [
                ...block.inlines.slice(0, index + 1),
                inline,
                ...(textAfter ? [afterInline] : []),
                ...block.inlines.slice(index + 1)
            ];
        } else {
            if (offsetInInline === 0) {
                block.inlines = [
                    ...block.inlines.slice(0, index),
                    inline,
                    ...block.inlines.slice(index)
                ];
            } else {
                block.inlines = [
                    ...block.inlines.slice(0, index + 1),
                    inline,
                    ...block.inlines.slice(index + 1)
                ];
            }
        }
        
        const newIndex = block.inlines.findIndex(i => i.id === inline.id);
        if (newIndex === block.inlines.length - 1 || !(block.inlines[newIndex + 1] instanceof InlineText)) {
            block.inlines.splice(newIndex + 1, 0, new InlineText(crypto.randomUUID()));
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
            const newInline = new InlineText(crypto.randomUUID());
            newInline.content = text;
            block.inlines = [newInline];
            this.emit({ type: "text_inserted", blockId: position.blockId, offset: 0, text });
            return;
        }

        const contentLength = block.getContentLength();
        if (position.offset === contentLength) {
            const lastInline = block.inlines[block.inlines.length - 1];
            if (lastInline instanceof InlineText) {
                lastInline.content += text;
            } else {
                const newInline = new InlineText(crypto.randomUUID());
                newInline.content = text;
                block.inlines = [...block.inlines, newInline];
            }
            this.emit({ type: "text_inserted", blockId: position.blockId, offset: position.offset, text });
            return;
        }

        const { inline, offsetInInline } = block.findInlineAtOffset(position.offset);
        if (inline instanceof InlineText) {
            inline.content = inline.content.substring(0, offsetInInline) + text + inline.content.slice(offsetInInline);
        } else {
            const newInline = new InlineText(crypto.randomUUID());
            newInline.content = text;
            const index = block.inlines.findIndex(i => i.id === inline.id);
            block.inlines = [...block.inlines.slice(0, index), newInline, ...block.inlines.slice(index)];
        }

        this.emit({ type: "text_inserted", blockId: position.blockId, offset: position.offset, text });
    }

    deleteContent(start: SelectionPosition, end: SelectionPosition) {
        const startBlock = this.blocks.find(block => block.id === start.blockId);
        const endBlock = this.blocks.find(block => block.id === end.blockId);

        if (!startBlock || !endBlock) return;

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
                    const keepStart = inlineStart.inline instanceof InlineText
                        ? (inlineStart.inline.content = inlineStart.inline.content.substring(0, inlineStart.offsetInInline), true)
                        : inlineStart.offsetInInline > 0;

                    const keepEnd = inlineEnd.inline instanceof InlineText
                        ? (inlineEnd.inline.content = inlineEnd.inline.content.slice(inlineEnd.offsetInInline), true)
                        : inlineEnd.offsetInInline === 0;

                    startBlock.inlines = [
                        ...startBlock.inlines.slice(0, startIdx + (keepStart ? 1 : 0)),
                        ...startBlock.inlines.slice(endIdx + (keepEnd ? 0 : 1)),
                    ];
                    startBlock._mergeAdjacentInlines();
                }
            } else {
                this.blocks = this.blocks.filter(b => b.id !== startBlock.id);
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
            let keepCurrentInline = true;
            if (inlineToCut.inline instanceof InlineText) {
                inlineToCut.inline.content = inlineToCut.inline.content.substring(0, inlineToCut.offsetInInline);
                keepCurrentInline = inlineToCut.inline.content.length > 0;
            } else {
                keepCurrentInline = inlineToCut.offsetInInline > 0;
            }
            startBlock.inlines = startBlock.inlines.slice(0, inlineToCutIndex + (keepCurrentInline ? 1 : 0));
        }

        if (endBlock instanceof TextBlock) {
            const inlineToCut = endBlock.findInlineAtOffset(end.offset);
            const inlineToCutIndex = endBlock.inlines.findIndex(i => i.id === inlineToCut.inline.id);
            let keepCurrentInline = true;
            if (inlineToCut.inline instanceof InlineText) {
                inlineToCut.inline.content = inlineToCut.inline.content.slice(inlineToCut.offsetInInline);
                keepCurrentInline = inlineToCut.inline.content.length > 0;
            } else {
                keepCurrentInline = inlineToCut.offsetInInline === 0;
            }
            endBlock.inlines = [
                ...(keepCurrentInline ? [inlineToCut.inline] : []),
                ...endBlock.inlines.slice(inlineToCutIndex + 1),
            ];
        }

        const startIndex = this.blocks.findIndex(b => b.id === start.blockId);
        const endIndex = this.blocks.findIndex(b => b.id === end.blockId);

        if (endIndex - startIndex > 1) {
            this.blocks = [
                ...this.blocks.slice(0, startIndex + 1),
                ...this.blocks.slice(endIndex),
            ];
        }

        if (startBlock instanceof TextBlock && endBlock instanceof TextBlock) {
            startBlock.inlines = [...startBlock.inlines, ...endBlock.inlines];
            startBlock._mergeAdjacentInlines();
            this.blocks = this.blocks.filter(b => b.id !== endBlock.id);
        } else if (!(startBlock instanceof TextBlock)) {
            this.blocks = this.blocks.filter(b => b.id !== startBlock.id);
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
