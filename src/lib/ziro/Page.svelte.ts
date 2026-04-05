import type {Block} from "$lib/ziro/Block";
import {Inline, InlineText, type ListStyle, TextBlock} from "$lib/ziro/TextBlock.svelte";

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

    updateBlockIndent(blockId: string, delta: number) {
        const block = this.blocks.find(b => b.id === blockId);
        if (block && block instanceof TextBlock) {
            block.indentLevel = Math.max(0, Math.min(4, block.indentLevel + delta));
        }
    }

    updateBlockList(blockId: string, listType: "unordered" | "ordered" | null, listStyle: ListStyle | null) {
        const block = this.blocks.find(b => b.id === blockId);
        if (block && block instanceof TextBlock) {
            block.listType = listType;
            block.listStyle = listStyle;
            if (listType && block.indentLevel === 0) {
                block.indentLevel = 1;
            }
        }
    }

    updateBlockVariant(blockId: string, variant: "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
        const block = this.blocks.find(b => b.id === blockId);
        if (block && block instanceof TextBlock) {
            block.variant = variant;
        }
    }

    insertBlock(block: Block, position: { type: "after_block", afterId: string } | { type: "end" }) {
        if (position.type === "after_block") {
            const index = this.blocks.findIndex(b => b.id === position.afterId);
            if (index === -1) {
                throw new Error("Failed to find block with id " + position.afterId);
            }

            this.blocks = [...this.blocks.slice(0, index + 1), block, ...this.blocks.slice(index + 1)]
            return;
        } else if (position.type === "end") {
            this.blocks = [...this.blocks, block]
        }
    }

    findBlock(predicate: (block: Block) => boolean) {
        return this.blocks.find(predicate);
    }

    setSelection(start: SelectionPosition, end: SelectionPosition | null) {
        this.selection = { start: start, end: end };
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

        // Step 1: Check if all text within selection has the style
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
                // If this is the end inline, and we haven't selected any of its characters (offsetInInline === 0), don't check it
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

        // Step 2: Apply the style to the selection range
        for (let i = startIdx; i <= endIdx; i++) {
            const block = this.blocks[i];
            if (!(block instanceof TextBlock)) continue;

            const isFirst = i === startIdx;
            const isLast = i === endIdx;
            const startOffset = isFirst ? sel.start.offset : 0;
            const endOffset = isLast ? sel.end.offset : block.getContentLength();

            if (startOffset === endOffset) continue;

            this.applyStyleToBlockRange(block, startOffset, endOffset, style, targetValue);
        }
    }

    private applyStyleToBlockRange(block: TextBlock, startOffset: number, endOffset: number, style: "bold" | "italic" | "underline" | "strikethrough" | "code", value: boolean) {
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
                // Split into 3 parts
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
        block.mergeAdjacentInlines();
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
            // If we are at a non-text inline, insert before or after based on offset
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
        
        // Ensure there's always an InlineText after an InlineSymbol so the user can type
        const newIndex = block.inlines.findIndex(i => i.id === inline.id);
        if (newIndex === block.inlines.length - 1 || !(block.inlines[newIndex + 1] instanceof InlineText)) {
            block.inlines.splice(newIndex + 1, 0, new InlineText(crypto.randomUUID()));
        }
    }

    insertText(position: SelectionPosition, text: string) {
        const block = this.blocks.find(b => b.id === position.blockId);
        if (!block || !(block instanceof TextBlock)) return;

        if (block.inlines.length === 0) {
            const newInline = new InlineText(crypto.randomUUID());
            newInline.content = text;
            block.inlines = [newInline];
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
    }

    deleteContent(start: SelectionPosition, end: SelectionPosition) {
        const startBlock = this.blocks.find(block => block.id === start.blockId);
        const endBlock = this.blocks.find(block => block.id === end.blockId);

        if (!startBlock || !endBlock) return;

        // --- Same block ---
        if (start.blockId === end.blockId) {
            if (startBlock instanceof TextBlock) {
                const inlineStart = startBlock.findInlineAtOffset(start.offset);
                const inlineEnd = startBlock.findInlineAtOffset(end.offset);
                const startIdx = startBlock.inlines.findIndex(i => i.id === inlineStart.inline.id);
                const endIdx = startBlock.inlines.findIndex(i => i.id === inlineEnd.inline.id);

                if (startIdx === endIdx) {
                    // Deletion within a single inline
                    if (inlineStart.inline instanceof InlineText) {
                        inlineStart.inline.content =
                            inlineStart.inline.content.substring(0, inlineStart.offsetInInline) +
                            inlineStart.inline.content.slice(inlineEnd.offsetInInline);
                    } else {
                        // Non-text inline: remove it entirely
                        startBlock.inlines = startBlock.inlines.filter(i => i.id !== inlineStart.inline.id);
                    }
                } else {
                    // Deletion spans multiple inlines within the same block
                    const keepStart = inlineStart.inline instanceof InlineText
                        ? (inlineStart.inline.content = inlineStart.inline.content.substring(0, inlineStart.offsetInInline), true)
                        : inlineStart.offsetInInline > 0; // keep if cursor is not at its start

                    const keepEnd = inlineEnd.inline instanceof InlineText
                        ? (inlineEnd.inline.content = inlineEnd.inline.content.slice(inlineEnd.offsetInInline), true)
                        : inlineEnd.offsetInInline === 0; // keep if cursor is at its start

                    startBlock.inlines = [
                        ...startBlock.inlines.slice(0, startIdx + (keepStart ? 1 : 0)),
                        ...startBlock.inlines.slice(endIdx + (keepEnd ? 0 : 1)),
                    ];
                    startBlock.mergeAdjacentInlines();
                }
            } else {
                // Non-TextBlock: remove it
                this.blocks = this.blocks.filter(b => b.id !== startBlock.id);
            }
            return;
        }

        // --- Different blocks ---

        // 1. Trim startBlock from the right
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

        // 2. Trim endBlock from the left
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

        // 3. Remove intermediate blocks
        const startIndex = this.blocks.findIndex(b => b.id === start.blockId);
        const endIndex = this.blocks.findIndex(b => b.id === end.blockId);

        if (endIndex - startIndex > 1) {
            this.blocks = [
                ...this.blocks.slice(0, startIndex + 1),
                ...this.blocks.slice(endIndex),
            ];
        }

        // 4. Merge startBlock and endBlock
        if (startBlock instanceof TextBlock && endBlock instanceof TextBlock) {
            startBlock.inlines = [...startBlock.inlines, ...endBlock.inlines];
            startBlock.mergeAdjacentInlines();
            this.blocks = this.blocks.filter(b => b.id !== endBlock.id);
        } else if (!(startBlock instanceof TextBlock)) {
            // startBlock is a non-text block (e.g. image): just remove it
            this.blocks = this.blocks.filter(b => b.id !== startBlock.id);
        }
    }
}

export interface SelectionPosition {
    blockId: string;
    offset: number;
}