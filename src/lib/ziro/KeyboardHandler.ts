import type {Page} from "$lib/ziro/Page.svelte";
import {InlineSymbol, InlineText, type ListStyle, TextBlock} from "$lib/ziro/TextBlock.svelte";

const WORD_SEPARATORS = [" ", "|"];

export class KeyboardHandler {
    page: Page;

    constructor(page: Page) {
        this.page = page;
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
                const domSelection = window.getSelection();
                if (!domSelection || domSelection.rangeCount === 0) return;

                const range = domSelection.getRangeAt(0);
                const cursorRect = range.getBoundingClientRect();

                const targetX = this.page.cursorXPosition ?? cursorRect.left;
                const lineHeight = cursorRect.height > 0 ? cursorRect.height : 20;

                const blockIdAtCursor = cursorPos.blockId;
                const currentBlock = this.page.findBlock(b => b.id === blockIdAtCursor);
                if (!currentBlock || !(currentBlock instanceof TextBlock)) return;

                const currentPositions = buildOffsetPositions(currentBlock);
                const currentCursorOffset = cursorPos.offset;
                const currentPos = currentPositions.get(currentCursorOffset);
                if (!currentPos) return;

                const targetY = event.key === "ArrowUp"
                    ? currentPos.y - lineHeight
                    : currentPos.y + lineHeight;

                const lines = getLines(currentPositions);
                const isTargetOutsideCurrentBlock = event.key === "ArrowUp"
                    ? targetY < lines[0] - lineHeight / 2
                    : targetY > lines[lines.length - 1] + lineHeight / 2;

                if (!isTargetOutsideCurrentBlock) {
                    const targetInSameBlock = findClosestOffsetInBlock(currentBlock, currentPositions, targetY, targetX);
                    if (targetInSameBlock !== null) {
                        this.updateSelection(currentBlock.id, targetInSameBlock, isShift);
                        this.page.cursorXPosition = targetX;
                    }
                    return;
                }

                const blockIndex = this.page.blocks.indexOf(currentBlock);
                const targetBlockIndex = event.key === "ArrowUp" ? blockIndex - 1 : blockIndex + 1;

                if (targetBlockIndex >= 0 && targetBlockIndex < this.page.blocks.length) {
                    const targetBlock = this.page.blocks[targetBlockIndex];
                    if (targetBlock instanceof TextBlock) {
                        const targetPositions = buildOffsetPositions(targetBlock);
                        const targetLines = getLines(targetPositions);

                        if (targetLines.length > 0) {
                            const blockTargetY = event.key === "ArrowUp"
                                ? targetLines[targetLines.length - 1]
                                : targetLines[0];

                            const bestOffset = findClosestOffsetInBlock(targetBlock, targetPositions, blockTargetY, targetX);
                            if (bestOffset !== null) {
                                this.updateSelection(targetBlock.id, bestOffset, isShift);
                                this.page.cursorXPosition = targetX;
                            }
                        }
                    }
                } else {
                    const edgeOffset = event.key === "ArrowUp" ? 0 : currentBlock.getContentLength();
                    this.updateSelection(currentBlock.id, edgeOffset, isShift);
                    this.page.cursorXPosition = targetX;
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
                const newCharInline = new InlineSymbol(crypto.randomUUID(), "check");
                this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                return;
            } else if (textBeforeCursor.endsWith("(x")) {
                event.preventDefault();
                this.page.deleteContent({ blockId: blockIdAtCursor, offset: cursorPos.offset - 2 }, { blockId: blockIdAtCursor, offset: cursorPos.offset });
                const newCharInline = new InlineSymbol(crypto.randomUUID(), "x");
                this.page.insertInlineAtOffset(blockIdAtCursor, cursorPos.offset - 2, newCharInline);
                this.page.setSelection({blockId: blockIdAtCursor, offset: cursorPos.offset - 1}, null);
                return;
            } else if (textBeforeCursor.endsWith("(?")) {
                event.preventDefault();
                this.page.deleteContent({ blockId: blockIdAtCursor, offset: cursorPos.offset - 2 }, { blockId: blockIdAtCursor, offset: cursorPos.offset });
                const newCharInline = new InlineSymbol(crypto.randomUUID(), "question_mark");
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

function getCaretPositionAtPoint(x: number, y: number): { element: Element | null, offset: number } | null {
    let node: Node | null = null;
    let offset = 0;

    if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x, y);
        if (pos) {
            node = pos.offsetNode;
            offset = pos.offset;
        }
    } else if ((document as any).caretRangeFromPoint) {
        const range = (document as any).caretRangeFromPoint(x, y);
        if (range) {
            node = range.startContainer;
            offset = range.startOffset;
        }
    }

    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
        const parent = node.parentElement;
        if (parent?.hasAttribute("data-ziro-editor-editable")) {
            return { element: parent, offset };
        }
        return null;
    }

    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute("data-ziro-editor-editable")) {
        return { element: node as Element, offset: 0 };
    }

    return null;
}

type OffsetPosition = { offset: number, x: number, y: number };

function buildOffsetPositions(block: TextBlock): Map<number, OffsetPosition> {
    const result = new Map<number, OffsetPosition>();

    for (const inline of block.inlines) {
        if (!(inline instanceof InlineText)) continue;

        const inlineElement = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${inline.id}"]`) as HTMLElement;
        if (!inlineElement || inlineElement.childNodes.length === 0) continue;

        const textNode = inlineElement.childNodes[0];
        if (textNode.nodeType !== Node.TEXT_NODE) continue;

        const blockOffset = block.findOffsetByInline(inline.id);

        for (let i = 0; i <= inline.content.length; i++) {
            const range = document.createRange();
            let rect: DOMRect | undefined;
            
            if (i < inline.content.length) {
                range.setStart(textNode, i);
                range.setEnd(textNode, i + 1);
                const rects = range.getClientRects();
                if (rects.length > 0) rect = rects[0];
            } else {
                // Because we append \u200B to every inline, textNode.length >= inline.content.length + 1
                // So at the very end of inline.content, index `i` points to \u200B
                if (textNode.nodeValue && i < textNode.nodeValue.length) {
                    range.setStart(textNode, i);
                    range.setEnd(textNode, i + 1);
                    const rects = range.getClientRects();
                    if (rects.length > 0) {
                        rect = rects[0];
                    }
                }
                
                if (!rect && i > 0) {
                    range.setStart(textNode, i - 1);
                    range.setEnd(textNode, i);
                    const rects = range.getClientRects();
                    if (rects.length > 0) rect = rects[rects.length - 1];
                }
            }

            if (rect) {
                let x = i < inline.content.length ? rect.left : rect.left; // Use left of \u200B for the end position
                let y = rect.top + rect.height / 2;

                // Special handling for positions immediately after a newline, if rects don't correctly wrap
                if (i > 0 && inline.content[i - 1] === '\n') {
                    // Check if the \u200B rect actually dropped down.
                    // If y is the same as the previous line (which we can't easily check here), we manually drop it.
                    // But with \u200B, the browser should natively give the correct bounding box for \u200B on the next line.
                    // To be safe, if we fall back to the i-1 rect (which is \n), we drop it:
                    if (!textNode.nodeValue || i >= textNode.nodeValue.length) {
                        const spanRect = inlineElement.getBoundingClientRect();
                        x = spanRect.left; 
                        y += rect.height; // approximate moving down one line
                    }
                }

                result.set(blockOffset + i, { offset: blockOffset + i, x, y });
            }
        }
    }

    return result;
}

function findClosestLine(positions: Map<number, OffsetPosition>, targetY: number): number[] {
    const lines = new Map<number, number[]>();

    for (const [offset, pos] of positions) {
        const lineKey = Math.round(pos.y);
        if (!lines.has(lineKey)) lines.set(lineKey, []);
        lines.get(lineKey)!.push(offset);
    }

    let closestLineKey: number | null = null;
    let closestDist = Infinity;

    for (const lineKey of lines.keys()) {
        const dist = Math.abs(lineKey - targetY);
        if (dist < closestDist) {
            closestDist = dist;
            closestLineKey = lineKey;
        }
    }

    return closestLineKey !== null ? lines.get(closestLineKey)! : [];
}

function findClosestX(offsets: number[], positions: Map<number, OffsetPosition>, targetX: number): number {
    let bestOffset = offsets[0];
    let bestDist = Infinity;

    for (const offset of offsets) {
        const pos = positions.get(offset);
        if (!pos) continue;
        const dist = Math.abs(pos.x - targetX);
        if (dist < bestDist) {
            bestDist = dist;
            bestOffset = offset;
        }
    }

    return bestOffset;
}

function findClosestOffsetInBlock(block: TextBlock, positions: Map<number, OffsetPosition>, targetY: number, targetX: number): number | null {
    const lineOffsets = findClosestLine(positions, targetY);
    if (lineOffsets.length === 0) return null;
    return findClosestX(lineOffsets, positions, targetX);
}

function getLines(positions: Map<number, OffsetPosition>): number[] {
    const ys = Array.from(positions.values()).map(p => p.y);
    ys.sort((a, b) => a - b);
    const lines: number[] = [];
    for (const y of ys) {
        if (lines.length === 0 || y - lines[lines.length - 1] > 5) {
            lines.push(y);
        }
    }
    return lines;
}