import type {Page} from "$lib/ziro/Page.svelte";
import {InlineSymbol, InlineText, type Inline, type ListStyle, TextBlock} from "$lib/ziro/TextBlock.svelte";
import {buildOffsetPositions, findClosestLine, handleVerticalNavigation} from "$lib/ziro/VerticalNavigation";
import {PasteHandler} from "$lib/ziro/PasteHandler";

const WORD_SEPARATORS = [" ", "|"];

function isEmoji(str: string): boolean {
    const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u;
    return emojiRegex.test(str);
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
                const block = this.page.findBlock(b => b.id === blockIdAtCursor);
                if (!block || !(block instanceof TextBlock)) return;

                const cursorOffset = this.page.selection!.start.offset;

                for (const segment of segments) {
                    if (isEmoji(segment.segment)) {
                        const emojiSymbol = new InlineSymbol(crypto.randomUUID(), {type: "emoji", emoji: segment.segment});
                        this.page.insertInlineAtOffset(blockIdAtCursor, cursorOffset, emojiSymbol);
                        this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset + 1}, null);
                    } else {
                        this.page.insertText({ blockId: blockIdAtCursor, offset: cursorOffset }, segment.segment);
                        this.page.setSelection({blockId: blockIdAtCursor, offset: cursorOffset + segment.segment.length}, null);
                    }
                }
                this.page.cursorXPosition = null;
            }
        }
    }

    onPaste(event: ClipboardEvent) {
        const clipboardData = event.clipboardData;
        if (!clipboardData) return;

        const plainText = clipboardData.getData("text/plain");
        const htmlText = clipboardData.getData("text/html");

        const segments = plainText ? [...new Intl.Segmenter().segment(plainText)] : [];
        const hasEmoji = segments.some(s => isEmoji(s.segment));
        const hasNewlines = plainText.includes("\n");
        const hasMultipleLines = plainText.split("\n").filter((l: string) => l.trim()).length > 1;

        console.log("Paste detected:", {
            plainText,
            htmlText,
            hasHTML: !!htmlText,
            hasEmoji,
            hasNewlines,
            hasMultipleLines,
            segmentCount: segments.length,
            segments: segments.map(s => ({ segment: s.segment, isEmoji: isEmoji(s.segment) })),
        });

        if (!htmlText) {
            const pasteHandler = new PasteHandler(this.page);
            const { resultingBlocks } = pasteHandler.fromPlaintext(plainText);
            
            if (resultingBlocks.length === 0) return;
            
            this.deleteSelection();
            
            const cursorBlockId = this.page.selection?.start.blockId;
            if (!cursorBlockId) return;
            
            const cursorBlock = this.page.findBlock(b => b.id === cursorBlockId);
            if (!cursorBlock) return;
            
            const cursorBlockIndex = this.page.blocks.indexOf(cursorBlock);
            const isCursorBlockEmpty = cursorBlock instanceof TextBlock && cursorBlock.getContentLength() === 0;

            if (resultingBlocks.length === 1) {
                const pastedBlock = resultingBlocks[0];
                if (cursorBlock instanceof TextBlock && pastedBlock instanceof TextBlock) {
                    const cursorOffset = this.page.selection!.start.offset;
                    const { inline: targetInline, offsetInInline } = cursorBlock.findInlineAtOffset(cursorOffset);
                    
                    if (targetInline instanceof InlineText) {
                        const textBefore = targetInline.content.substring(0, offsetInInline);
                        const textAfter = targetInline.content.substring(offsetInInline);
                        
                        const newInlines: Inline[] = [];
                        if (textBefore.length > 0) {
                            const beforeInline = new InlineText(crypto.randomUUID());
                            beforeInline.content = textBefore;
                            Object.assign(beforeInline, targetInline);
                            newInlines.push(beforeInline);
                        }
                        
                        newInlines.push(...pastedBlock.inlines);
                        
                        if (textAfter.length > 0) {
                            const afterInline = new InlineText(crypto.randomUUID());
                            afterInline.content = textAfter;
                            Object.assign(afterInline, targetInline);
                            newInlines.push(afterInline);
                        }
                        
                        const targetIndex = cursorBlock.inlines.indexOf(targetInline);
                        cursorBlock.inlines = [
                            ...cursorBlock.inlines.slice(0, targetIndex),
                            ...newInlines,
                            ...cursorBlock.inlines.slice(targetIndex + 1)
                        ];
                        
                        cursorBlock.mergeAdjacentInlines();
                        
                        const newOffset = cursorOffset + pastedBlock.getContentLength();
                        this.page.setSelection({ blockId: cursorBlockId, offset: newOffset }, null);
                    } else {
                        const targetIndex = cursorBlock.inlines.indexOf(targetInline);
                        cursorBlock.inlines = [
                            ...cursorBlock.inlines.slice(0, targetIndex + 1),
                            ...pastedBlock.inlines,
                            ...cursorBlock.inlines.slice(targetIndex + 1)
                        ];
                        
                        cursorBlock.mergeAdjacentInlines();
                        
                        const newOffset = cursorOffset + pastedBlock.getContentLength();
                        this.page.setSelection({ blockId: cursorBlockId, offset: newOffset }, null);
                    }
                }
            } else if (isCursorBlockEmpty) {
                this.page.blocks = this.page.blocks.filter(b => b.id !== cursorBlockId);
                const newCursorBlockIndex = cursorBlockIndex;
                
                for (let i = 0; i < resultingBlocks.length; i++) {
                    const block = resultingBlocks[i];
                    const insertAfterId = i === 0 
                        ? (newCursorBlockIndex > 0 ? this.page.blocks[newCursorBlockIndex - 1].id : null)
                        : this.page.blocks[newCursorBlockIndex + i - 1].id;
                    
                    if (insertAfterId) {
                        this.page.insertBlock(block, { type: "after_block", afterId: insertAfterId });
                    } else {
                        this.page.blocks = [block, ...this.page.blocks];
                    }
                }
                
                const firstNewBlock = resultingBlocks[0];
                this.page.setSelection({ blockId: firstNewBlock.id, offset: firstNewBlock.getContentLength() }, null);
            } else {
                for (let i = 0; i < resultingBlocks.length; i++) {
                    const block = resultingBlocks[i];
                    this.page.insertBlock(block, { type: "after_block", afterId: i === 0 ? cursorBlockId : this.page.blocks[cursorBlockIndex + i].id });
                }
                
                const firstNewBlock = resultingBlocks[0];
                this.page.setSelection({ blockId: firstNewBlock.id, offset: firstNewBlock.getContentLength() }, null);
            }
            
            this.page.cursorXPosition = null;
        }

        event.preventDefault();
    }

    private deleteSelection(): boolean {
        const normalized = this.page.getNormalizedSelection();
        if (normalized) {
            this.page.deleteContent(normalized.start, normalized.end);
            this.page.setSelection(normalized.start, null);
            return true;
        }
        return false;
    }

    private updateSelection(blockId: string, offset: number, isShift: boolean) {
        if (isShift) {
            const start = this.page.selection!.start;
            this.page.setSelection(start, { blockId, offset });
        } else {
            this.page.setSelection({ blockId, offset }, null);
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

    onEvent(event: KeyboardEvent) {
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) {
            const key = event.key.toLowerCase();
            if (key === "b") {
                event.preventDefault();
                this.page.toggleStyle("bold");
                return;
            } else if (key === "i") {
                event.preventDefault();
                this.page.toggleStyle("italic");
                return;
            } else if (key === "u") {
                event.preventDefault();
                this.page.toggleStyle("underline");
                return;
            } else if (key === "j") {
                event.preventDefault();
                this.page.toggleStyle("strikethrough");
                return;
            }
        }

        if (event.key === "Tab") {
            event.preventDefault();
            this.deleteSelection();
            const cursorPos = this.getCursorPosition();
            if (!cursorPos) return;
            const block = this.page.findBlock(b => b.id === cursorPos.blockId);
            if (block instanceof TextBlock) {
                if (event.shiftKey) {
                    this.page.updateBlockIndent(block.id, -1);
                } else if (cursorPos.offset === 0) {
                    this.page.updateBlockIndent(block.id, 1);
                } else {
                    const newPos = this.getCursorPosition() || cursorPos;
                    this.page.insertText({ blockId: block.id, offset: newPos.offset }, "\t");
                    this.page.setSelection({ blockId: block.id, offset: newPos.offset + 1 }, null);
                    this.page.cursorXPosition = null;
                }
            }
            return;
        }

        if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();

            const blockIdAtCursor = this.page.selection?.start.blockId;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            this.deleteSelection();

            const cursorOffset = this.page.selection!.start.offset;
            this.page.insertText({ blockId: blockIdAtCursor, offset: cursorOffset }, "\n");
            this.page.setSelection({ blockId: blockIdAtCursor, offset: cursorOffset + 1 }, null);
            this.page.cursorXPosition = null;
            return;
        }

        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            this.deleteSelection();
            const blockIdAtCursor = this.page.selection?.start.blockId
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor)
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

            const newBlock = new TextBlock(crypto.randomUUID())
            newBlock.indentLevel = block.indentLevel;
            
            if (block instanceof TextBlock) {
                if (!event.ctrlKey) {
                    let listContext: TextBlock | null = null;
                    const currentIndex = this.page.blocks.indexOf(block);
                    for (let i = currentIndex; i >= 0; i--) {
                        const b = this.page.blocks[i];
                        if (b instanceof TextBlock) {
                            if (b.indentLevel < block.indentLevel) {
                                break;
                            }
                            if (b.indentLevel === block.indentLevel && b.listType) {
                                listContext = b;
                                break;
                            }
                        }
                    }
                    
                    if (listContext) {
                        newBlock.listType = listContext.listType;
                        newBlock.listStyle = listContext.listStyle;
                    }
                }

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
                    this.page.cursorXPosition = null;
                    return;
                }
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
        }

        if (event.key === "Backspace") {
            event.preventDefault();

            if (this.deleteSelection()) {
                return;
            }

            const blockIdAtCursor = this.page.selection!.start.blockId;
            const cursorOffset = this.page.selection!.start.offset;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block) return;

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
                if (event.metaKey) {
                    deleteStartOffset = this.getTargetLineOffset(block, cursorOffset, true);
                } else if (event.altKey) {
                    deleteStartOffset = findPrevWordBoundary(block.getVisualText(), cursorOffset);
                } else {
                    deleteStartOffset = cursorOffset - 1;
                }

                const start = { blockId: blockIdAtCursor, offset: deleteStartOffset };
                const end = { blockId: blockIdAtCursor, offset: cursorOffset };
                this.page.deleteContent(start, end);
                this.page.setSelection({ blockId: blockIdAtCursor, offset: deleteStartOffset }, null);
                this.page.cursorXPosition = null;
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
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
                const block = this.page.findBlock(b => b.id === blockIdAtCursor);
                if (!block || !(block instanceof TextBlock)) return;

                if (event.key === "ArrowLeft") {
                    if (event.metaKey) {
                        this.updateSelection(blockIdAtCursor, this.getTargetLineOffset(block, cursorOffset, true), isShift);
                    } else if (event.altKey) {
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
                } else if (event.key === "ArrowRight") {
                    if (event.metaKey) {
                        this.updateSelection(blockIdAtCursor, this.getTargetLineOffset(block, cursorOffset, false), isShift);
                    } else if (event.altKey) {
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

        if (event.key === ")") {
            const cursorPos = this.getCursorPosition();
            if (!cursorPos) return;
            const blockIdAtCursor = cursorPos.blockId;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            const currentInline = block.findInlineAtOffset(cursorPos.offset).inline;
            const textBeforeCursor = block.getVisualText().slice(0, cursorPos.offset);
            if (textBeforeCursor.endsWith("(/")) {
                event.preventDefault();
                this.page.deleteContent({ blockId: blockIdAtCursor, offset: cursorPos.offset - 2 }, { blockId: blockIdAtCursor, offset: cursorPos.offset });
                const newCharInline = new InlineSymbol(crypto.randomUUID(), {type: "check"});
                this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                return;
            } else if (textBeforeCursor.endsWith("(x")) {
                event.preventDefault();
                this.page.deleteContent({ blockId: blockIdAtCursor, offset: cursorPos.offset - 2 }, { blockId: blockIdAtCursor, offset: cursorPos.offset });
                const newCharInline = new InlineSymbol(crypto.randomUUID(), {type: "x"});
                this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                return;
            } else if (textBeforeCursor.endsWith("(?")) {
                event.preventDefault();
                this.page.deleteContent({ blockId: blockIdAtCursor, offset: cursorPos.offset - 2 }, { blockId: blockIdAtCursor, offset: cursorPos.offset });
                const newCharInline = new InlineSymbol(crypto.randomUUID(), {type: "question_mark"});
                this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                return;
            }
        }

        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();

            this.deleteSelection();

            const blockIdAtCursor = this.page.selection?.start.blockId;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block || !(block instanceof TextBlock)) return;

            const cursorOffset = this.page.selection!.start.offset;

            if (event.key === " ") {
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
                        listStyle = { type: "bullet" };
                    } else if (textBefore === "-") {
                        listStyle = { type: "dash" };
                    } else {
                        listStyle = { type: "arrow" };
                    }
                    this.page.updateBlockList(block.id, "unordered", listStyle);
                    this.page.deleteContent({blockId: block.id, offset: 0}, {blockId: block.id, offset: cursorOffset});
                    this.page.setSelection({blockId: block.id, offset: 0}, null);
                    this.page.cursorXPosition = null;
                    return;
                } else {
                    const orderedMatch = textBefore.match(/^([0-9]+|a|A|i|I)([.)])$/);
                    if (orderedMatch) {
                        const trigger = orderedMatch[1];
                        const suffix = orderedMatch[2];
                        let listStyle: ListStyle;

                        if (/^[0-9]+$/.test(trigger)) {
                            listStyle = { type: "ordered", prefix: "", suffix: suffix as "." | ")", variant: "number" };
                        } else if (trigger === "a") {
                            listStyle = { type: "ordered", prefix: "", suffix: suffix as "." | ")", variant: "letter_lowercase" };
                        } else if (trigger === "A") {
                            listStyle = { type: "ordered", prefix: "", suffix: suffix as "." | ")", variant: "letter_uppercase" };
                        } else if (trigger === "i") {
                            listStyle = { type: "ordered", prefix: "", suffix: suffix as "." | ")", variant: "roman_lowercase" };
                        } else {
                            listStyle = { type: "ordered", prefix: "", suffix: suffix as "." | ")", variant: "roman_uppercase" };
                        }

                        this.page.updateBlockList(block.id, "ordered", listStyle);
                        this.page.deleteContent({blockId: block.id, offset: 0}, {blockId: block.id, offset: cursorOffset});
                        this.page.setSelection({blockId: block.id, offset: 0}, null);
                        this.page.cursorXPosition = null;
                        return;
                    }
                }
            }

            this.page.insertText({ blockId: blockIdAtCursor, offset: cursorOffset }, event.key);
            this.page.setSelection({ blockId: blockIdAtCursor, offset: cursorOffset + event.key.length }, null);
            this.page.cursorXPosition = null;
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