import type {Page, SelectionPosition} from "$lib/ziro/Page.svelte";
import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";

type OffsetPosition = { offset: number, x: number, y: number };

export type VerticalNavigationResult = {
    blockId: string;
    offset: number;
    targetX: number;
};

export function buildOffsetPositions(block: TextBlock): Map<number, OffsetPosition> {
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
                let x = i < inline.content.length ? rect.left : rect.left;
                let y = rect.top + rect.height / 2;

                if (i > 0 && inline.content[i - 1] === '\n') {
                    if (!textNode.nodeValue || i >= textNode.nodeValue.length) {
                        const spanRect = inlineElement.getBoundingClientRect();
                        x = spanRect.left; 
                        y += rect.height;
                    }
                }

                result.set(blockOffset + i, { offset: blockOffset + i, x, y });
            }
        }
    }

    return result;
}

export function findClosestLine(positions: Map<number, OffsetPosition>, targetY: number): number[] {
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

export function handleVerticalNavigation(
    page: Page,
    event: KeyboardEvent,
    cursorPos: SelectionPosition
): VerticalNavigationResult | null {
    const domSelection = window.getSelection();
    if (!domSelection || domSelection.rangeCount === 0) return null;

    const cursorRect = getCursorRect(domSelection);
    if (!cursorRect) return null;

    const targetX = page.cursorXPosition ?? cursorRect.left;
    const lineHeight = cursorRect.height > 0 ? cursorRect.height : 20;

    const currentBlock = page.findBlock(b => b.id === cursorPos.blockId);
    if (!currentBlock || !(currentBlock instanceof TextBlock)) return null;

    const currentPositions = buildOffsetPositions(currentBlock);
    const currentPos = currentPositions.get(cursorPos.offset);
    if (!currentPos) return null;

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
            return { blockId: currentBlock.id, offset: targetInSameBlock, targetX };
        }
        return null;
    }

    const blockIndex = page.blocks.indexOf(currentBlock);
    const targetBlockIndex = event.key === "ArrowUp" ? blockIndex - 1 : blockIndex + 1;

    if (targetBlockIndex >= 0 && targetBlockIndex < page.blocks.length) {
        const targetBlock = page.blocks[targetBlockIndex];
        if (targetBlock instanceof TextBlock) {
            const targetPositions = buildOffsetPositions(targetBlock);
            const targetLines = getLines(targetPositions);

            if (targetLines.length > 0) {
                const blockTargetY = event.key === "ArrowUp"
                    ? targetLines[targetLines.length - 1]
                    : targetLines[0];

                const bestOffset = findClosestOffsetInBlock(targetBlock, targetPositions, blockTargetY, targetX);
                if (bestOffset !== null) {
                    return { blockId: targetBlock.id, offset: bestOffset, targetX };
                }
            }
        }
    } else {
        const edgeOffset = event.key === "ArrowUp" ? 0 : currentBlock.getContentLength();
        return { blockId: currentBlock.id, offset: edgeOffset, targetX };
    }

    return null;
}

function getCursorRect(domSelection: Selection): DOMRect | null {
    const focusNode = domSelection.focusNode;
    const focusOffset = domSelection.focusOffset;

    if (focusNode && focusNode.nodeType === Node.TEXT_NODE) {
        const parent = focusNode.parentElement;
        const inlineId = parent?.getAttribute('data-ziro-editor-editable-for-block-inline-id');
        if (inlineId) {
            const range = document.createRange();
            const safeOffset = Math.min(focusOffset, focusNode.nodeValue?.length ?? 0);
            if (safeOffset < (focusNode.nodeValue?.length ?? 0)) {
                range.setStart(focusNode, safeOffset);
                range.setEnd(focusNode, safeOffset + 1);
            } else if (safeOffset > 0) {
                range.setStart(focusNode, safeOffset - 1);
                range.setEnd(focusNode, safeOffset);
            } else {
                return null;
            }
            const rects = range.getClientRects();
            if (rects.length > 0) return rects[0];
        }
    }

    const range = domSelection.getRangeAt(0);
    return range.getBoundingClientRect();
}
