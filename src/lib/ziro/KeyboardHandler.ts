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
            this.page.cursorXPosition = null;
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
                    this.page.cursorXPosition = null;
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
                this.page.cursorXPosition = null;
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
        }

        if (isArrowKey(event.key)) {
            event.preventDefault();
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                const domSelection = window.getSelection();
                if (!domSelection || domSelection.rangeCount === 0) return;

                const range = domSelection.getRangeAt(0);
                const cursorRect = range.getBoundingClientRect();

                const targetX = this.page.cursorXPosition ?? cursorRect.left;
                const lineHeight = cursorRect.height > 0 ? cursorRect.height : 20;

                const blockIdAtCursor = this.page.selection!.start.blockId;
                const currentBlock = this.page.findBlock(b => b.id === blockIdAtCursor);
                if (!currentBlock || !(currentBlock instanceof TextBlock)) return;

                const currentPositions = buildOffsetPositions(currentBlock);
                const currentCursorOffset = this.page.selection!.start.offset;
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
                        this.page.setSelection({ blockId: currentBlock.id, offset: targetInSameBlock }, null);
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
                                this.page.setSelection({ blockId: targetBlock.id, offset: bestOffset }, null);
                                this.page.cursorXPosition = targetX;
                            }
                        }
                    }
                } else {
                    const edgeOffset = event.key === "ArrowUp" ? 0 : currentBlock.getContentLength();
                    this.page.setSelection({ blockId: currentBlock.id, offset: edgeOffset }, null);
                    this.page.cursorXPosition = targetX;
                }
            } else {
                this.page.cursorXPosition = null;
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
            if (i < inline.content.length) {
                range.setStart(textNode, i);
                range.setEnd(textNode, i + 1);
            } else {
                range.setStart(textNode, i - 1);
                range.setEnd(textNode, i);
            }

            const rects = range.getClientRects();
            if (rects.length > 0) {
                const rect = rects[0];
                const x = i < inline.content.length ? rect.left : rect.right;
                const y = rect.top + rect.height / 2;
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