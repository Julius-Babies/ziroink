import {isNonCollapsedSelection, type Page} from "$lib/ziro/Page.svelte";
import {type ListStyle, TextBlock} from "$lib/ziro/TextBlock.svelte";
import {buildOffsetPositions, findClosestLine, handleVerticalNavigation} from "$lib/ziro/VerticalNavigation";
import {
    isArrowKey,
    isInsertLineBreak,
    isNewBlock,
    isPrimaryControlKey,
    isToggleStyle
} from "$lib/ziro/editor/keyboard/getEventAction";
import {copyPaste} from "$lib/ziro/editor/CopyPaste.svelte";

const WORD_SEPARATORS = [" ", "|", ".", ",", ";", ":", "!", "?", "(", ")", "[", "]", "{", "}", "\"", "'"];

function isEmoji(str: string): boolean {
    const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u;
    return emojiRegex.test(str);
}

function isMac(): boolean {
    if (typeof window === "undefined") return false;
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export class KeyboardHandler {
    page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    onBeforeInput(event: InputEvent) {
        if (event.data) {
            const segments = [...new Intl.Segmenter().segment(event.data)];
            const hasEmoji = segments.some(s => isEmoji(s.segment));
            if (hasEmoji) {
                event.preventDefault();

                this.deleteSelection();

                const blockIdAtCursor = this.page.selection?.start.blockId;
                if (!blockIdAtCursor) return;
                const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor);
                if (!block || !(block instanceof TextBlock)) return;

                const cursorOffset = this.page.selection!.start.offset;

                for (const segment of segments) {
                    if (isEmoji(segment.segment)) {
                        const emojiSymbol = this.page.factory.createInlineSymbol({
                            type: "emoji",
                            emoji: segment.segment
                        });
                        this.page.insertInlineAtOffset(blockIdAtCursor, cursorOffset, emojiSymbol);
                        this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset + 1}, null);
                    } else {
                        this.page.insertText({blockId: blockIdAtCursor, offset: cursorOffset}, segment.segment);
                        this.page.setSelection({
                            blockId: blockIdAtCursor,
                            offset: cursorOffset + segment.segment.length
                        }, null);
                    }
                }
                this.page.cursorXPosition = null;
            }
        }
    }

    async onPaste(event: ClipboardEvent) {
        event.preventDefault();
        await copyPaste.paste(this.page);
    }

    private deleteSelection(): boolean {
        const normalized = this.page.getNormalizedSelection();
        if (normalized) {
            this.page.deleteContent(normalized.start, normalized.end, this.page.selection?.isBlockSelection || false);
            
            if (this.page.selection?.isBlockSelection) {
                // After deleting a block selection, place cursor at the beginning of the block that took its place
                // or the last block if it was the end of the page.
                const blockId = normalized.start.blockId;
                const block = this.page.findBlock((b: any) => b.id === blockId) || this.page.blocks[Math.max(0, this.page.blocks.length - 1)];
                if (block) {
                    this.page.setSelection({ blockId: block.id, offset: 0 }, null);
                } else {
                    this.page.selection = null;
                }
            } else {
                this.page.setSelection(normalized.start, null);
            }
            return true;
        }
        return false;
    }

    private updateSelection(blockId: string, offset: number, isShift: boolean) {
        if (isShift) {
            const start = this.page.selection!.start;
            this.page.setSelection(start, {blockId, offset});
        } else {
            this.page.setSelection({blockId, offset}, null);
        }
    }

    private getTargetLineOffset(block: TextBlock, currentOffset: number, isStart: boolean): number {
        const positions = buildOffsetPositions(block);
        const currentPos = positions.get(currentOffset);
        if (currentPos) {
            const lineOffsets = findClosestLine(positions, currentPos.y);
            if (lineOffsets.length > 0) {
                return isStart ? Math.min(...lineOffsets) : Math.max(...lineOffsets);
            }
        }
        return isStart ? 0 : block.getContentLength();
    }

    private getCursorPosition(): { blockId: string, offset: number } | null {
        if (!this.page.selection) return null;
        return this.page.selection.end ?? this.page.selection.start;
    }

    private handleSelectAll() {
        const cursorPos = this.getCursorPosition();
        if (!cursorPos) return;

        const block = this.page.findBlock((b: any) => b.id === cursorPos.blockId);
        if (!block) return;

        const sel = this.page.selection;
        const blockContentLength = block instanceof TextBlock ? block.getContentLength() : 0;

        // Stage 3: If single block is selected (isBlockSelection true and start==end), select all blocks
        // This check MUST come first so we can advance from block selection to all blocks
        if (sel?.isBlockSelection === true && sel.start.blockId === sel.end?.blockId && sel.start.offset === 0 && sel.end?.offset === 0) {
            const contentBlocks = this.page.blocks.filter((_, i) => i > 0);
            if (contentBlocks.length > 0) {
                const firstContentBlock = contentBlocks[0];
                const lastContentBlock = contentBlocks[contentBlocks.length - 1];

                this.page.setSelection(
                    { blockId: firstContentBlock.id, offset: 0 },
                    { blockId: lastContentBlock.id, offset: lastContentBlock instanceof TextBlock ? lastContentBlock.getContentLength() : 0 },
                    true
                );
            }
            return;
        }

        // Stage 1: If current block is textblock and not fully selected, select entire content
        if (block instanceof TextBlock) {
            const isContentFullySelected = 
                sel?.isBlockSelection === false &&
                sel?.end !== null &&
                sel.start.blockId === block.id &&
                sel.end.blockId === block.id &&
                sel.start.offset === 0 &&
                sel.end.offset === blockContentLength;

            if (!isContentFullySelected) {
                this.page.setSelection(
                    { blockId: block.id, offset: 0 },
                    { blockId: block.id, offset: blockContentLength },
                    false
                );
                return;
            }
        }

        // Stage 2: If content already selected (or non-text block), select single block
        // Skip block selection for the title block (index 0)
        const blockIndex = this.page.blocks.indexOf(block);
        if (blockIndex === 0) {
            return;
        }

        this.page.setSelection(
            { blockId: block.id, offset: 0 },
            { blockId: block.id, offset: 0 },
            true
        );
    }

    async onCompositionEnd(e: CompositionEvent) {
        e.preventDefault();
        await this.handleNewCharacter(e.data);
    }

    async onEvent(event: KeyboardEvent) {
        if (event.isComposing) return;

        if (isToggleStyle(event)) {
            const key = event.key.toLowerCase();
            if (!isNonCollapsedSelection(this.page.selection)) return;
            const selection = this.page.selection;
            if (key === "b") {
                event.preventDefault();
                await this.page.withAction(async () => this.page.toggleStyle("bold", {
                    forceTo: null,
                    onSelection: selection
                }))
                return;
            } else if (key === "i") {
                event.preventDefault();
                await this.page.withAction(async () => this.page.toggleStyle("italic", {
                    forceTo: null,
                    onSelection: selection
                }))
                return;
            } else if (key === "u") {
                event.preventDefault();
                await this.page.withAction(async () => this.page.toggleStyle("underline", {
                    forceTo: null,
                    onSelection: selection
                }))
                return;
            } else if (key === "j") {
                event.preventDefault();
                await this.page.withAction(async () => this.page.toggleStyle("strikethrough", {forceTo: null, onSelection: selection}))
                return;
            }
        }

        if (event.key === "Tab") {
            event.preventDefault();
            if (isNonCollapsedSelection(this.page.selection)) {
                const selection = this.page.selection;
                await this.page.withAction(async () => {
                    const selectedBlocks = this.page.getSelectedBlocks(selection);
                    selectedBlocks.forEach(block => {
                        if (event.shiftKey) {
                            this.page.updateBlockIndent(block.id, -1);
                        } else {
                            this.page.updateBlockIndent(block.id, 1);
                        }
                    });
                });
                return;
            }


            await this.page.withAction(async () => {
                const cursorPos = this.getCursorPosition();
                if (!cursorPos) return;
                const block = this.page.findBlock((b: any) => b.id === cursorPos.blockId);
                if (!block) return;
                this.deleteSelection();
                if (event.shiftKey) {
                    this.page.updateBlockIndent(block.id, -1);
                } else if (cursorPos.offset === 0) {
                    this.page.updateBlockIndent(block.id, 1);
                }
            });
            return;
        }

        if (isInsertLineBreak(event)) {
            event.preventDefault();

            const blockIdAtCursor = this.page.selection?.start.blockId;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            await this.page.withAction(async () => {
                this.deleteSelection();

                const cursorOffset = this.page.selection!.start.offset;
                this.page.insertText({blockId: blockIdAtCursor, offset: cursorOffset}, "\n");
                this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset + 1}, null);
                this.page.cursorXPosition = null;
            });
            return;
        }

        if (isNewBlock(event)) {
            event.preventDefault();
            await this.page.withAction(async () => {
                this.deleteSelection();
                const blockIdAtCursor = this.page.selection?.start.blockId
                if (!blockIdAtCursor) return;
                const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor)
                if (!block) return;

                if (block instanceof TextBlock) {
                    if (block.getVisualText() === "") {
                        if (block.listType) {
                            this.page.updateBlockList(block.id, null, null);
                            return;
                        }
                        if (block.indentLevel > 0) {
                            this.page.updateBlockIndent(block.id, -1);
                            return;
                        }
                    }
                }

                if (block instanceof TextBlock) {
                    const cursorOffset = this.page.selection!.start.offset;
                    const { newBlockId } = this.page.splitBlock(block.id, cursorOffset);
                    this.page.setSelection({blockId: newBlockId, offset: 0}, null);
                    this.page.cursorXPosition = null;
                    return;
                } else {
                    throw new Error("Non-text blocks are not yet supported")
                }
            })
            return;
        }

        if (event.key === "Backspace") {
            event.preventDefault();

            if (isNonCollapsedSelection(this.page.selection)) {
                await this.page.withAction(async () => {
                    this.deleteSelection();
                })
                return;
            }

            const blockIdAtCursor = this.page.selection!.start.blockId;
            const cursorOffset = this.page.selection!.start.offset;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor);
            if (!block) return;

            await this.page.withAction(async () => {
                if (block instanceof TextBlock) {
                    if (cursorOffset === 0) {
                        if (block.listType) {
                            this.page.updateBlockList(block.id, null, null);
                            return;
                        }

                        if (block.variant !== "paragraph") {
                            this.page.updateBlockVariant(block.id, "paragraph");
                            return;
                        }

                        if (block.indentLevel > 0) {
                            this.page.updateBlockIndent(block.id, -1);
                            return;
                        }

                        const index = this.page.blocks.indexOf(block);
                        if (index <= 0) return;

                        const previousBlock = this.page.blocks[index - 1];
                        if (previousBlock instanceof TextBlock) {
                            const prevContentLength = this.page.mergeBlocks(previousBlock.id, block.id);
                            this.page.setSelection({blockId: previousBlock.id, offset: prevContentLength}, null);
                        } else {
                            this.page.blocks = this.page.blocks.filter(b => b.id !== block.id);
                            if (previousBlock instanceof TextBlock) {
                                this.page.setSelection({
                                    blockId: previousBlock.id,
                                    offset: previousBlock.getContentLength()
                                }, null);
                            }
                        }
                        return;
                    }

                    let deleteStartOffset: number;
                    const useLineJump = isMac() ? event.metaKey : false; // Windows meta key is for OS
                    const useWordJump = isMac() ? event.altKey : event.ctrlKey;

                    if (useLineJump) {
                        deleteStartOffset = this.getTargetLineOffset(block, cursorOffset, true);
                    } else if (useWordJump) {
                        deleteStartOffset = findPrevWordBoundary(block.getVisualText(), cursorOffset);
                    } else {
                        deleteStartOffset = cursorOffset - 1;
                    }

                    const start = {blockId: blockIdAtCursor, offset: deleteStartOffset};
                    const end = {blockId: blockIdAtCursor, offset: cursorOffset};
                    this.page.deleteContent(start, end);
                    this.page.setSelection({blockId: blockIdAtCursor, offset: deleteStartOffset}, null);
                    this.page.cursorXPosition = null;
                } else {
                    throw new Error("Non-text blocks are not yet supported")
                }
            })

            return;
        }

        if (event.key === "z" && isPrimaryControlKey(event)) {
            event.preventDefault();
            if (event.shiftKey) {
                this.page.redo();
            } else {
                this.page.undo();
            }
            return;
        }

        if (event.key === "y" && isPrimaryControlKey(event)) {
            event.preventDefault();
            this.page.redo();
            return;
        }

        if (isArrowKey(event.key)) {
            event.preventDefault();
            const isShift = event.shiftKey;
            const cursorPos = this.getCursorPosition();
            if (!cursorPos) return;

            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                const result = handleVerticalNavigation(this.page, event, cursorPos);
                if (result) {
                    this.updateSelection(result.blockId, result.offset, isShift);
                    this.page.cursorXPosition = result.targetX;
                }
            } else {
                this.page.cursorXPosition = null;
                const blockIdAtCursor = cursorPos.blockId;
                const cursorOffset = cursorPos.offset;
                if (!blockIdAtCursor) return;
                const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor);
                if (!block || !(block instanceof TextBlock)) return;

                if (event.key === "ArrowLeft" || event.key === "Home") {
                    const useLineJump = isMac() ? event.metaKey : (event.key === "Home");
                    const useWordJump = isMac() ? event.altKey : event.ctrlKey;

                    if (useLineJump) {
                        this.updateSelection(blockIdAtCursor, this.getTargetLineOffset(block, cursorOffset, true), isShift);
                    } else if (useWordJump) {
                        const newOffset = findPrevWordBoundary(block.getVisualText(), cursorOffset);
                        if (newOffset < cursorOffset) {
                            this.updateSelection(blockIdAtCursor, newOffset, isShift);
                        } else if (cursorOffset === 0) {
                            const indexOfBlock = this.page.blocks.indexOf(block);
                            if (indexOfBlock > 0) {
                                const previousBlock = this.page.blocks[indexOfBlock - 1];
                                if (previousBlock instanceof TextBlock) {
                                    const prevText = previousBlock.getVisualText();
                                    const prevWordOffset = findPrevWordBoundary(prevText, prevText.length);
                                    this.updateSelection(previousBlock.id, prevWordOffset, isShift);
                                }
                            }
                        }
                    } else if (cursorOffset > 0) {
                        this.updateSelection(blockIdAtCursor, cursorOffset - 1, isShift);
                    } else {
                        const indexOfBlock = this.page.blocks.indexOf(block);
                        if (indexOfBlock > 0) {
                            const previousBlock = this.page.blocks[indexOfBlock - 1];
                            if (previousBlock instanceof TextBlock) {
                                this.updateSelection(previousBlock.id, previousBlock.getContentLength(), isShift);
                            }
                        }
                    }
                } else if (event.key === "ArrowRight" || event.key === "End") {
                    const useLineJump = isMac() ? event.metaKey : (event.key === "End");
                    const useWordJump = isMac() ? event.altKey : event.ctrlKey;

                    if (useLineJump) {
                        this.updateSelection(blockIdAtCursor, this.getTargetLineOffset(block, cursorOffset, false), isShift);
                    } else if (useWordJump) {
                        const text = block.getVisualText();
                        const newOffset = findNextWordBoundary(text, cursorOffset);
                        if (newOffset > cursorOffset) {
                            this.updateSelection(blockIdAtCursor, newOffset, isShift);
                        } else {
                            const indexOfBlock = this.page.blocks.indexOf(block);
                            if (indexOfBlock < this.page.blocks.length - 1) {
                                const nextBlock = this.page.blocks[indexOfBlock + 1];
                                if (nextBlock instanceof TextBlock) {
                                    const nextText = nextBlock.getVisualText();
                                    const nextWordOffset = findNextWordBoundary(nextText, 0);
                                    this.updateSelection(nextBlock.id, nextWordOffset, isShift);
                                }
                            }
                        }
                    } else if (cursorOffset < block.getContentLength()) {
                        this.updateSelection(blockIdAtCursor, cursorOffset + 1, isShift);
                    } else {
                        const indexOfBlock = this.page.blocks.indexOf(block);
                        if (indexOfBlock < this.page.blocks.length - 1) {
                            const nextBlock = this.page.blocks[indexOfBlock + 1];
                            if (nextBlock instanceof TextBlock) {
                                this.updateSelection(nextBlock.id, 0, isShift);
                            }
                        }
                    }
                }
            }
        }

        if (event.key === "a" && isPrimaryControlKey(event)) {
            event.preventDefault();
            this.handleSelectAll();
            return;
        }

        if (event.key === "c" && isPrimaryControlKey(event)) {
            event.preventDefault();
            await this.handleCopy();
            return;
        }

        if (event.key === "x" && isPrimaryControlKey(event)) {
            event.preventDefault();
            await this.page.withAction(async () => {
                await this.handleCut();
            })
            return;
        }

        if (event.key === ")") {
            const cursorPos = this.getCursorPosition();
            if (!cursorPos) return;
            const blockIdAtCursor = cursorPos.blockId;
            const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            const textBeforeCursor = block.getVisualText().slice(0, cursorPos.offset);
            await this.page.withAction(async () => {
                if (textBeforeCursor.endsWith("(/")) {
                    event.preventDefault();
                    this.page.deleteContent({
                        blockId: blockIdAtCursor,
                        offset: cursorPos.offset - 2
                    }, {blockId: blockIdAtCursor, offset: cursorPos.offset});
                    const newCharInline = this.page.factory.createInlineSymbol({type: "check"});
                    this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                    this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                    return;
                } else if (textBeforeCursor.endsWith("(x")) {
                    event.preventDefault();
                    this.page.deleteContent({
                        blockId: blockIdAtCursor,
                        offset: cursorPos.offset - 2
                    }, {blockId: blockIdAtCursor, offset: cursorPos.offset});
                    const newCharInline = this.page.factory.createInlineSymbol({type: "x"});
                    this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                    this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                    return;
                } else if (textBeforeCursor.endsWith("(?")) {
                    event.preventDefault();
                    this.page.deleteContent({
                        blockId: blockIdAtCursor,
                        offset: cursorPos.offset - 2
                    }, {blockId: blockIdAtCursor, offset: cursorPos.offset});
                    const newCharInline = this.page.factory.createInlineSymbol({type: "question_mark"});
                    this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                    this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                    return;
                }
            });
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault()
            this.deleteSelection();
            await this.handleNewCharacter(event.key);
        }
    }

    private async handleCopy() {
        if (!isNonCollapsedSelection(this.page.selection)) return;
        await copyPaste.copy(this.page.blocks, this.page.selection, this.page);
    }

    private async handleCut() {
        if (!isNonCollapsedSelection(this.page.selection)) return;
        await copyPaste.copy(this.page.blocks, this.page.selection, this.page);
        this.deleteSelection();
    }

    private async handleNewCharacter(key: string) {
        const blockIdAtCursor = this.page.selection?.start.blockId;
        if (!blockIdAtCursor) return;
        const block = this.page.findBlock((b: any) => b.id === blockIdAtCursor);
        if (!block || !(block instanceof TextBlock)) return;

        const cursorOffset = this.page.selection!.start.offset;

        if (key === "*") {
            const textBefore = block.getVisualText().slice(0, cursorOffset);
            const isNextCharStar = block.getVisualText()[cursorOffset] === "*";

            if (textBefore.endsWith("*") && !isNextCharStar) {
                const searchIn = textBefore.slice(0, -1);
                const idx = searchIn.lastIndexOf("**");
                if (idx !== -1) {
                    const contentStart = idx + 2;
                    const contentEnd = cursorOffset - 1;

                    if (contentEnd > contentStart && block.getVisualText().slice(contentStart, contentEnd).trim()) {
                        await this.page.withAction(async () => {
                            this.page.toggleStyle("bold", {
                                forceTo: true,
                                onSelection: {
                                    isBlockSelection: false,
                                    start: {blockId: blockIdAtCursor, offset: contentStart},
                                    end: {blockId: blockIdAtCursor, offset: contentEnd},
                                }
                            });
                            this.page.deleteContent(
                                {blockId: blockIdAtCursor, offset: cursorOffset - 1},
                                {blockId: blockIdAtCursor, offset: cursorOffset}
                            );
                            this.page.deleteContent(
                                {blockId: blockIdAtCursor, offset: idx},
                                {blockId: blockIdAtCursor, offset: idx + 2}
                            );
                            this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset - 3}, null);
                        })
                        return;
                    }
                }
            }

            const singleIdx = (() => {
                for (let i = textBefore.length - 1; i >= 0; i--) {
                    if (textBefore[i] === "*") {
                        const isDouble = (i > 0 && textBefore[i - 1] === "*") || (i < textBefore.length - 1 && textBefore[i + 1] === "*");
                        if (!isDouble) return i;
                    }
                }
                return -1;
            })();

            if (singleIdx !== -1) {
                const contentStart = singleIdx + 1;
                const contentEnd = cursorOffset;

                if (contentEnd > contentStart && block.getVisualText().slice(contentStart, contentEnd).trim()) {
                    await this.page.withAction(async () => {
                        this.page.toggleStyle("italic", {
                            forceTo: true,
                            onSelection: {
                                isBlockSelection: false,
                                start: {blockId: blockIdAtCursor, offset: contentStart},
                                end: {blockId: blockIdAtCursor, offset: contentEnd},
                            }
                        });
                        this.page.deleteContent(
                            {blockId: blockIdAtCursor, offset: singleIdx},
                            {blockId: blockIdAtCursor, offset: singleIdx + 1}
                        );
                        this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset - 1}, null);
                    })
                    return;
                }
            }
        }

        if (key === "_" || key === "~" || key === "`") {
            const cursorOffset = this.page.selection!.start.offset;
            const textBefore = block.getVisualText().slice(0, cursorOffset);

            const tryApplyStyle = async (
                style: "italic" | "underline" | "strikethrough" | "code",
                marker: string,
                trailingInText = 0,
            ): Promise<boolean> => {
                const contentEnd = cursorOffset - trailingInText;

                const idx = (() => {
                    for (let i = textBefore.length - marker.length; i >= 0; i--) {
                        if (textBefore.slice(i, i + marker.length) === marker) {
                            const charBefore = textBefore[i - 1];
                            const charAfter = textBefore[i + marker.length];
                            if (charBefore === marker[0] || charAfter === marker[0]) continue;
                            return i;
                        }
                    }
                    return -1;
                })();

                if (idx === -1) return false;

                const contentStart = idx + marker.length;
                const content = block.getVisualText().slice(contentStart, contentEnd);
                if (contentEnd <= contentStart || !content.trim()) return false;

                await this.page.withAction(async () => {
                    this.page.toggleStyle(style, {
                        forceTo: true,
                        onSelection: {
                            isBlockSelection: false,
                            start: { blockId: blockIdAtCursor, offset: contentStart },
                            end:   { blockId: blockIdAtCursor, offset: contentEnd },
                        }
                    });
                    this.page.deleteContent(
                        { blockId: blockIdAtCursor, offset: contentEnd },
                        { blockId: blockIdAtCursor, offset: contentEnd + trailingInText }
                    );
                    this.page.deleteContent(
                        { blockId: blockIdAtCursor, offset: idx },
                        { blockId: blockIdAtCursor, offset: idx + marker.length }
                    );
                    this.page.setSelection({ blockId: blockIdAtCursor, offset: contentEnd - marker.length }, null);
                });

                return true;
            };

            if (key === "_") {
                if (textBefore.endsWith("_")) {
                    if (await tryApplyStyle("underline", "__", 1)) return;
                }
                if (await tryApplyStyle("italic", "_", 0)) return;
            } else if (key === "~") {
                if (textBefore.endsWith("~")) {
                    if (await tryApplyStyle("strikethrough", "~~", 1)) return;
                }
            } else if (key === "`") {
                if (await tryApplyStyle("code", "`", 0)) return;
            }
        }

        if (key === " ") {
            const textBefore = block.getVisualText().slice(0, cursorOffset);
            if (textBefore.match(/^#{1,6}$/)) {
                this.page.updateBlockVariant(block.id, `h${textBefore.length}` as any);
                this.page.deleteContent({blockId: block.id, offset: 0}, {blockId: block.id, offset: cursorOffset});
                this.page.setSelection({blockId: block.id, offset: 0}, null);
                this.page.cursorXPosition = null;
                return;
            } else if (textBefore.match(/^(\*|-|->)$/)) {
                let listStyle: ListStyle;
                if (textBefore === "*") {
                    listStyle = {type: "bullet"};
                } else if (textBefore === "-") {
                    listStyle = {type: "dash"};
                } else {
                    listStyle = {type: "arrow"};
                }
                await this.page.withAction(async () => {
                    this.page.updateBlockList(block.id, "unordered", listStyle);
                    this.page.deleteContent({blockId: block.id, offset: 0}, {blockId: block.id, offset: cursorOffset});
                    this.page.setSelection({blockId: block.id, offset: 0}, null);
                });
                this.page.cursorXPosition = null;
                return;
            } else {
                const orderedMatch = textBefore.match(/^([0-9]+|a|A|i|I)([.)])$/);
                if (orderedMatch) {
                    const trigger = orderedMatch[1];
                    const suffix = orderedMatch[2];
                    let listStyle: ListStyle;

                    if (/^[0-9]+$/.test(trigger)) {
                        listStyle = {type: "ordered", prefix: "", suffix: suffix as "." | ")", variant: "number"};
                    } else if (trigger === "a") {
                        listStyle = {
                            type: "ordered",
                            prefix: "",
                            suffix: suffix as "." | ")",
                            variant: "letter_lowercase"
                        };
                    } else if (trigger === "A") {
                        listStyle = {
                            type: "ordered",
                            prefix: "",
                            suffix: suffix as "." | ")",
                            variant: "letter_uppercase"
                        };
                    } else if (trigger === "i") {
                        listStyle = {
                            type: "ordered",
                            prefix: "",
                            suffix: suffix as "." | ")",
                            variant: "roman_lowercase"
                        };
                    } else {
                        listStyle = {
                            type: "ordered",
                            prefix: "",
                            suffix: suffix as "." | ")",
                            variant: "roman_uppercase"
                        };
                    }

                    await this.page.withAction(async () => {
                        this.page.updateBlockList(block.id, "ordered", listStyle);
                        this.page.deleteContent({blockId: block.id, offset: 0}, {blockId: block.id, offset: cursorOffset});
                        this.page.setSelection({blockId: block.id, offset: 0}, null);
                    });
                    this.page.cursorXPosition = null;
                    return;
                }

                const checkboxCheckedMatch = textBefore.match(/^\[x]$/)
                const checkboxUncheckedMatch = textBefore.match(/^\[ ]$/)

                if (checkboxCheckedMatch || checkboxUncheckedMatch) {
                    let listStyle: ListStyle = { type: "checkbox", checked: !checkboxUncheckedMatch }
                    await this.page.withAction(async () => {
                        this.page.updateBlockList(block.id, "unordered", listStyle);
                        this.page.deleteContent({blockId: block.id, offset: 0}, {blockId: block.id, offset: cursorOffset});
                        this.page.setSelection({blockId: block.id, offset: 0}, null);
                    });
                    this.page.cursorXPosition = null;
                    return;
                }
            }
        }

        await this.page.withAction(async () => {
            this.page.insertText({blockId: blockIdAtCursor, offset: cursorOffset}, key);
            this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset + key.length}, null);
        });
        this.page.cursorXPosition = null;
    }
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
