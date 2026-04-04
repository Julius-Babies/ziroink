import type {Block} from "$lib/ziro/Block";
import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";


export class Page {
    blocks: Block[] = $state([])
    selection: null | {
        start: SelectionPosition;
        end: SelectionPosition | null;
    } = $state(null);

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