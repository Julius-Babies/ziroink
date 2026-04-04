import type {Page} from "$lib/ziro/Page.svelte";
import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";

const WORD_SEPARATORS = [" ", "|"];

export class KeyboardHandler {
    page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    onEvent(event: KeyboardEvent) {
        if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();

            const blockIdAtCursor = this.page.selection?.start.blockId;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            if (this.page.selection?.end) {
                this.page.deleteContent(this.page.selection.start, this.page.selection.end);
                this.page.setSelection(this.page.selection.start, null);
            }

            const cursorOffset = this.page.selection!.start.offset;
            this.page.insertText({ blockId: blockIdAtCursor, offset: cursorOffset }, "\n");
            this.page.setSelection({ blockId: blockIdAtCursor, offset: cursorOffset + 1 }, null);
            return;
        }

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const blockIdAtCursor = this.page.selection?.start.blockId
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor)
            if (!block) return;

            const newBlock = new TextBlock(crypto.randomUUID())

            if (block instanceof TextBlock) {
                const inlineAtCursor = block.findInlineAtOffset(this.page.selection!.start.offset)
                const index = block.inlines.indexOf(inlineAtCursor.inline);
                if (inlineAtCursor.inline instanceof InlineText) {
                    const textBeforeCursor = inlineAtCursor.inline.content.slice(0, inlineAtCursor.offsetInInline);
                    const textAfterCursor = inlineAtCursor.inline.content.slice(inlineAtCursor.offsetInInline);
                    if (textAfterCursor !== "") {
                        const newInline = new InlineText(crypto.randomUUID());
                        newInline.content = textAfterCursor;
                        inlineAtCursor.inline.content = textBeforeCursor;
                        newBlock.inlines = [...newBlock.inlines, newInline];
                    }

                    newBlock.inlines = [...newBlock.inlines, ...block.inlines.slice(index + 1, block.inlines.length)];
                    block.inlines = block.inlines.slice(0, index + 1);

                    if (newBlock.inlines.length === 0) {
                        newBlock.inlines = [new InlineText(crypto.randomUUID())];
                    }

                    this.page.insertBlock(newBlock, {type: "after_block", afterId: block.id})
                    this.page.setSelection({blockId: newBlock.id, offset: 0}, null)
                    return;
                }
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
        }

        if (event.key === "Backspace") {
            event.preventDefault();

            const blockIdAtCursor = this.page.selection!.start.blockId;
            const cursorOffset = this.page.selection!.start.offset;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block) return;

            if (block instanceof TextBlock) {
                if (this.page.selection?.end) {
                    this.page.deleteContent(this.page.selection.start, this.page.selection.end);
                    this.page.setSelection(this.page.selection.start, null);
                    return;
                }

                if (cursorOffset === 0) {
                    const index = this.page.blocks.indexOf(block);
                    if (index <= 0) return;

                    const previousBlock = this.page.blocks[index - 1];
                    if (previousBlock instanceof TextBlock) {
                        const prevContentLength = previousBlock.getContentLength();
                        previousBlock.inlines = [...previousBlock.inlines, ...block.inlines];
                        previousBlock.mergeAdjacentInlines();
                        this.page.blocks = this.page.blocks.filter(b => b.id !== block.id);
                        this.page.setSelection({ blockId: previousBlock.id, offset: prevContentLength }, null);
                    } else {
                        this.page.blocks = this.page.blocks.filter(b => b.id !== block.id);
                        if (previousBlock instanceof TextBlock) {
                            this.page.setSelection({ blockId: previousBlock.id, offset: previousBlock.getContentLength() }, null);
                        }
                    }
                    return;
                }

                let deleteStartOffset: number;
                if (event.altKey || event.metaKey) {
                    deleteStartOffset = findPrevWordBoundary(block.getVisualText(), cursorOffset);
                } else {
                    deleteStartOffset = cursorOffset - 1;
                }

                const start = { blockId: blockIdAtCursor, offset: deleteStartOffset };
                const end = { blockId: blockIdAtCursor, offset: cursorOffset };
                this.page.deleteContent(start, end);
                this.page.setSelection({ blockId: blockIdAtCursor, offset: deleteStartOffset }, null);
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
        }

        if (isArrowKey(event.key)) {
            event.preventDefault();
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {

            } else {
                const blockIdAtCursor = this.page.selection!.start.blockId;
                const cursorOffset = this.page.selection!.start.offset;
                if (!blockIdAtCursor) return;
                const block = this.page.findBlock(b => b.id === blockIdAtCursor);
                if (!block || !(block instanceof TextBlock)) return;

                if (event.key === "ArrowLeft") {
                    if (event.altKey || event.metaKey) {
                        const newOffset = findPrevWordBoundary(block.getVisualText(), cursorOffset);
                        if (newOffset < cursorOffset) {
                            this.page.setSelection({ blockId: blockIdAtCursor, offset: newOffset }, null);
                        } else if (cursorOffset === 0) {
                            const indexOfBlock = this.page.blocks.indexOf(block);
                            if (indexOfBlock <= 0) return;
                            const previousBlock = this.page.blocks[indexOfBlock - 1];
                            if (previousBlock instanceof TextBlock) {
                                const prevText = previousBlock.getVisualText();
                                const prevWordOffset = findPrevWordBoundary(prevText, prevText.length);
                                this.page.setSelection({ blockId: previousBlock.id, offset: prevWordOffset }, null);
                            }
                        }
                    } else if (cursorOffset > 0) {
                        this.page.setSelection({ blockId: blockIdAtCursor, offset: cursorOffset - 1 }, null);
                    } else {
                        const indexOfBlock = this.page.blocks.indexOf(block);
                        if (indexOfBlock <= 0) return;
                        const previousBlock = this.page.blocks[indexOfBlock - 1];
                        if (previousBlock instanceof TextBlock) {
                            this.page.setSelection({ blockId: previousBlock.id, offset: previousBlock.getContentLength() }, null);
                        }
                    }
                } else if (event.key === "ArrowRight") {
                    if (event.altKey || event.metaKey) {
                        const text = block.getVisualText();
                        const newOffset = findNextWordBoundary(text, cursorOffset);
                        if (newOffset > cursorOffset) {
                            this.page.setSelection({ blockId: blockIdAtCursor, offset: newOffset }, null);
                        } else {
                            const indexOfBlock = this.page.blocks.indexOf(block);
                            if (indexOfBlock >= this.page.blocks.length - 1) return;
                            const nextBlock = this.page.blocks[indexOfBlock + 1];
                            if (nextBlock instanceof TextBlock) {
                                const nextText = nextBlock.getVisualText();
                                const nextWordOffset = findNextWordBoundary(nextText, 0);
                                this.page.setSelection({ blockId: nextBlock.id, offset: nextWordOffset }, null);
                            }
                        }
                    } else if (cursorOffset < block.getContentLength()) {
                        this.page.setSelection({ blockId: blockIdAtCursor, offset: cursorOffset + 1 }, null);
                    } else {
                        const indexOfBlock = this.page.blocks.indexOf(block);
                        if (indexOfBlock >= this.page.blocks.length - 1) return;
                        const nextBlock = this.page.blocks[indexOfBlock + 1];
                        if (nextBlock instanceof TextBlock) {
                            this.page.setSelection({ blockId: nextBlock.id, offset: 0 }, null);
                        }
                    }
                }
            }
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();

            const blockIdAtCursor = this.page.selection?.start.blockId;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            if (this.page.selection?.end) {
                this.page.deleteContent(this.page.selection.start, this.page.selection.end);
                this.page.setSelection(this.page.selection.start, null);
            }

            const cursorOffset = this.page.selection!.start.offset;
            this.page.insertText({ blockId: blockIdAtCursor, offset: cursorOffset }, event.key);
            this.page.setSelection({ blockId: blockIdAtCursor, offset: cursorOffset + event.key.length }, null);
        }
    }
}

function isArrowKey(key: string): boolean {
    return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key);
}

function findPrevWordBoundary(text: string, fromOffset: number): number {
    let textBeforeCursor = text.slice(0, fromOffset);

    while (textBeforeCursor.length > 0 && WORD_SEPARATORS.includes(textBeforeCursor.slice(-1))) {
        textBeforeCursor = textBeforeCursor.slice(0, -1);
    }

    const lastSeparatorIndex = Math.max(...WORD_SEPARATORS.map(s => textBeforeCursor.lastIndexOf(s)));
    return lastSeparatorIndex === -1 ? 0 : lastSeparatorIndex + 1;
}

function findNextWordBoundary(text: string, fromOffset: number): number {
    let textAfterCursor = text.slice(fromOffset);

    let i = 0;
    while (i < textAfterCursor.length && WORD_SEPARATORS.includes(textAfterCursor[i])) {
        i++;
    }

    while (i < textAfterCursor.length && !WORD_SEPARATORS.includes(textAfterCursor[i])) {
        i++;
    }

    return fromOffset + i;
}