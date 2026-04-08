<script lang="ts">
    import type {Page, SelectionPosition} from "$lib/ziro/Page.svelte";
    import {InlineSymbol, InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
    import {fade} from "svelte/transition";

    let {
        page,
    }: {
        page: Page
    } = $props();

    let isDragging = false;
    let dragStartPos: SelectionPosition | null = null;
    let clickTimeout: ReturnType<typeof setTimeout> | null = null;
    let clickCount = 0;

    function getPositionFromEvent(e: MouseEvent): SelectionPosition | null {
        // First, check if we clicked directly on an editable element (useful for symbols/emojis)
        const targetEl = (e.target as Element)?.closest('[data-ziro-editor-editable]');

        let node: Node | null = null;
        let offset = 0;

        if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (pos) {
                node = pos.offsetNode;
                offset = pos.offset;
            }
        } else if ((document as any).caretRangeFromPoint) {
            const range = (document as any).caretRangeFromPoint(e.clientX, e.clientY);
            if (range) {
                node = range.startContainer;
                offset = range.startOffset;
            }
        }

        let element: Element | null = targetEl;

        if (!element && node) {
            if (node.nodeType === Node.TEXT_NODE) {
                element = node.parentElement?.closest('[data-ziro-editor-editable]') || null;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                element = (node as Element).closest('[data-ziro-editor-editable]');
            }
        }

        if (element) {
            const blockId = element.getAttribute("data-ziro-editor-editable-for-block-id");
            const inlineId = element.getAttribute("data-ziro-editor-editable-for-block-inline-id");
            if (blockId && inlineId) {
                const block = page.findBlock(b => b.id === blockId);
                if (block && block instanceof TextBlock) {
                    const inline = block.inlines.find(i => i.id === inlineId);
                    if (inline instanceof InlineText) {
                        // If we used the targetEl directly but it's a text inline, 
                        // we still need the offset from caretPositionFromPoint if available.
                        // If caretPositionFromPoint didn't give us this element, we might need to approximate.
                        if (element !== targetEl || !node) {
                            // Approximation if caret didn't hit it: use X position
                            // But usually caretPositionFromPoint is reliable for text.
                        }
                        offset = Math.min(offset, inline.content.length);
                        return {blockId, offset: block.findOffsetByInline(inlineId) + offset};
                    } else if (inline) {
                        const rect = element.getBoundingClientRect();
                        const xPositionRelativeToElement = e.clientX - rect.left;
                        const symbolOffset = block.findOffsetByInline(inlineId);

                        // 50/50 rule: If user clicks in the left 50% of the non-text inline, place cursor before it.
                        // If user clicks in the right 50%, place cursor after it.
                        if (xPositionRelativeToElement < rect.width / 2) {
                            return {blockId, offset: symbolOffset};
                        } else {
                            return {blockId, offset: symbolOffset + 1};
                        }
                    }
                }
            }
        }

        return null;
    }

    function onMouseDown(e: MouseEvent) {
        if ((page as any).cursorXPosition !== undefined) {
            (page as any).cursorXPosition = null;
        }

        // Disable native selection to implement our own. 
        // We'll sync our state back to the DOM selection manually in the effect.
        if (e.detail > 1) {
            // Prevent default to stop native double/triple click selection
            e.preventDefault();
        }

        const pos = getPositionFromEvent(e);
        if (!pos) return;

        clickCount++;
        if (clickTimeout) clearTimeout(clickTimeout);

        if (clickCount === 2) {
            // Double click: word selection
            const block = page.findBlock(b => b.id === pos.blockId);
            if (block instanceof TextBlock) {
                const text = block.getVisualText();
                const startOffset = findPrevWordBoundary(text, pos.offset);
                const endOffset = findNextWordBoundary(text, pos.offset);
                page.setSelection({blockId: pos.blockId, offset: startOffset}, {
                    blockId: pos.blockId,
                    offset: endOffset
                }, false);
            }
            clickTimeout = setTimeout(() => clickCount = 0, 400);
            return;
        }

        if (clickCount === 3) {
            // Triple click: block selection
            const block = page.findBlock(b => b.id === pos.blockId);
            if (block instanceof TextBlock) {
                page.setSelection({blockId: pos.blockId, offset: 0}, {
                    blockId: pos.blockId,
                    offset: block.getContentLength()
                }, false);
            }
            clickTimeout = setTimeout(() => clickCount = 0, 400);
            return;
        }

        clickTimeout = setTimeout(() => clickCount = 0, 400);

        isDragging = true;
        dragStartPos = pos;

        if (e.shiftKey && page.selection) {
            page.setSelection(page.selection.start, pos, page.selection.isBlockSelection);
            dragStartPos = page.selection.start;
        } else {
            page.setSelection(pos, null, false);
        }
    }

    function onMouseMove(e: MouseEvent) {
        if (!isDragging || !dragStartPos) return;

        // Prevent native dragging of elements/text causing weird cursor artifacts
        e.preventDefault();

        const pos = getPositionFromEvent(e);
        if (!pos) return;

        // If moved outside single click range, treat as target
        if (pos.blockId !== dragStartPos.blockId || pos.offset !== dragStartPos.offset) {
            let isBlockSelection = page.selection?.isBlockSelection ?? false;
            
            // If dragging, we enter block selection if start or end is not index 0
            // BUT wait, the requirement is "ensure the block selection does not target our headline"
            // and "first block to be even selectable by the block selection mode".
            
            const startIdx = page.blocks.findIndex(b => b.id === dragStartPos!.blockId);
            const endIdx = page.blocks.findIndex(b => b.id === pos.blockId);
            
            if (isBlockSelection && (startIdx === 0 || endIdx === 0)) {
                // If we are in block selection mode and drag into the headline, 
                // we should probably stay in block selection but the visual highlight 
                // will be handled by the effect. 
                // However, the user said "first block not even selectable by the block selection mode".
                // This implies if a range is a block selection, it shouldn't include block 0.
            }

            page.setSelection(dragStartPos, pos, isBlockSelection);
        } else {
            page.setSelection(dragStartPos, null, false);
        }
    }

    function onMouseUp() {
        isDragging = false;
        dragStartPos = null;
    }

    const WORD_SEPARATORS = [" ", "|"];

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
        while (i < textAfterCursor.length && WORD_SEPARATORS.includes(textAfterCursor[i])) i++;
        while (i < textAfterCursor.length && !WORD_SEPARATORS.includes(textAfterCursor[i])) i++;
        return fromOffset + i;
    }

    function getDomNodeAndOffsetForPosition(pos: SelectionPosition): { node: Node, offset: number } | null {
        const block = page.findBlock(b => b.id === pos.blockId);
        if (!block || !(block instanceof TextBlock)) return null;

        let {inline, offsetInInline} = block.findInlineAtOffset(pos.offset);

        const inlineIndex = block.inlines.findIndex(i => i.id === inline.id);

        // Preference: If we are at the end of a text inline (offsetInInline === content.length),
        // we prefer staying in that text inline rather than jumping to the next inline's start.
        // This is more stable for the browser caret.
        // findInlineAtOffset returns offsetInInline <= length.

        if (inline instanceof InlineText) {
            const inlineEditable = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${inline.id}"]`) as HTMLElement;
            if (!inlineEditable) return null;

            let anchorNode: Node | null = null;
            for (let i = 0; i < inlineEditable.childNodes.length; i++) {
                if (inlineEditable.childNodes[i].nodeType === Node.TEXT_NODE) {
                    anchorNode = inlineEditable.childNodes[i];
                    break;
                }
            }

            if (!anchorNode) {
                return {node: inlineEditable, offset: 0};
            }

            return {node: anchorNode, offset: Math.min(offsetInInline, (anchorNode as Text).length)};
        } else if (inline instanceof InlineSymbol) {
            const inlineEditable = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${inline.id}"]`) as HTMLElement;
            if (!inlineEditable) return null;

            // If we are at offset 1 (AFTER) of a symbol, we strongly prefer jumping to the NEXT inline
            // if it's a text inline, as browsers render carets in text nodes much more reliably.
            if (offsetInInline === 1 && inlineIndex < block.inlines.length - 1) {
                const next = block.inlines[inlineIndex + 1];
                if (next instanceof InlineText) {
                    const nextEditable = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${next.id}"]`) as HTMLElement;
                    if (nextEditable) {
                        let nextNode: Node | null = null;
                        for (let i = 0; i < nextEditable.childNodes.length; i++) {
                            if (nextEditable.childNodes[i].nodeType === Node.TEXT_NODE) {
                                nextNode = nextEditable.childNodes[i];
                                break;
                            }
                        }
                        // Even if there's no text node (empty inline), targeting the inline element at offset 0 
                        // is often better than targeting a symbol at offset 1.
                        return {node: nextNode || nextEditable, offset: 0};
                    }
                }
            }

            // If we are at offset 0 (BEFORE) a symbol and there's a PREVIOUS text inline, jump to its end.
            if (offsetInInline === 0 && inlineIndex > 0) {
                const prev = block.inlines[inlineIndex - 1];
                if (prev instanceof InlineText) {
                    const prevEditable = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${prev.id}"]`) as HTMLElement;
                    if (prevEditable) {
                        let prevNode: Node | null = null;
                        for (let i = 0; i < prevEditable.childNodes.length; i++) {
                            if (prevEditable.childNodes[i].nodeType === Node.TEXT_NODE) {
                                prevNode = prevEditable.childNodes[i];
                                break;
                            }
                        }
                        if (prevNode) return {node: prevNode, offset: (prevNode as Text).length};
                    }
                }
            }

            // If we're stuck on the symbol itself (e.g. symbol is the only thing in the block),
            // we MUST target the parent container and use the index-based offset.
            // Targeting the symbol element directly with offset 0/1 is the primary cause of invisible carets.
            const parent = inlineEditable.parentNode;
            if (parent) {
                const index = Array.from(parent.childNodes).indexOf(inlineEditable);
                if (index !== -1) {
                    // offset: index places it BEFORE, index + 1 places it AFTER
                    return {node: parent, offset: index + offsetInInline};
                }
            }

            return {node: inlineEditable, offset: offsetInInline};
        }

        return null;
    }

    let selectionRects: Rect[] = $state([]);

    type Rect = { top: number, bottom: number, left: number, right: number, width: number, height: number, key: string };

    function getNormalizedSelectionRects(range: Range, startPos: SelectionPosition, endPos: SelectionPosition): Rect[] {
        const textRects: Rect[] = [];

        const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;
        if (!rootNode) return [];

        const treeWalker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    if (!node.parentElement?.hasAttribute("data-ziro-editor-editable")) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const textNodes: { node: Text, start: number, end: number }[] = [];
        let textNode: Node | null;
        while (textNode = treeWalker.nextNode()) {
            const text = textNode as Text;
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(text);
            if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) continue;
            if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0) continue;

            const actualStart = (text === range.startContainer) ? range.startOffset : 0;
            const actualEnd = (text === range.endContainer) ? range.endOffset : text.length;

            textNodes.push({
                node: text,
                start: Math.min(actualStart, actualEnd),
                end: Math.max(actualStart, actualEnd)
            });
        }

        for (const {node, start, end} of textNodes) {
            if (start >= end) continue;
            const charRange = document.createRange();
            charRange.setStart(node, start);
            charRange.setEnd(node, end);
            for (const rect of charRange.getClientRects()) {
                if (rect.width > 0 && rect.height > 0) {
                    textRects.push({
                        key: node.parentElement?.getAttribute('data-ziro-editor-editable-for-block-inline-id') || `${rect.top}-${rect.left}`,
                        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
                        width: rect.width, height: rect.height
                    });
                }
            }
        }

        const allSymbolEls = document.querySelectorAll('[data-ziro-editor-editable-for-block-inline-id]');
        const symbolRects: Rect[] = [];
        for (const el of Array.from(allSymbolEls)) {
            const blockId = el.getAttribute('data-ziro-editor-editable-for-block-id')!;
            const inlineId = el.getAttribute('data-ziro-editor-editable-for-block-inline-id')!;
            const block = page.findBlock(b => b.id === blockId);
            if (!(block instanceof TextBlock)) continue;
            const inline = block.inlines.find(i => i.id === inlineId);
            if (!(inline instanceof InlineSymbol)) continue;

            const symbolOffset = block.findOffsetByInline(inlineId);
            const symbolStart = {blockId, offset: symbolOffset};
            const symbolEnd = {blockId, offset: symbolOffset + 1};

            const startsBeforeEnd = comparePositions(symbolStart, endPos) < 0;
            const endsAfterStart = comparePositions(symbolEnd, startPos) > 0;
            if (startsBeforeEnd && endsAfterStart) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    symbolRects.push({
                        key: inlineId,
                        top: rect.top,
                        bottom: rect.bottom,
                        left: rect.left,
                        right: rect.right,
                        width: rect.width,
                        height: rect.height
                    });
                }
            }
        }

        if (textRects.length === 0 && symbolRects.length === 0) return [];

        const dominantHeight = Math.max(
            ...textRects.map(r => r.height),
            ...symbolRects.map(r => r.height),
            0
        );

        const expandedTextRects = textRects.map(r => {
            if (r.height < dominantHeight - 1) {
                const diff = dominantHeight - r.height;
                return {
                    key: r.key,
                    top: r.top - diff / 2,
                    bottom: r.bottom + diff / 2,
                    left: r.left,
                    right: r.right,
                    width: r.width,
                    height: dominantHeight,
                };
            }
            return r;
        });

        const expandedSymbolRects = symbolRects.map(r => {
            if (r.height < dominantHeight - 1) {
                const diff = dominantHeight - r.height;
                return {
                    key: r.key,
                    top: r.top - diff / 2,
                    bottom: r.bottom + diff / 2,
                    left: r.left,
                    right: r.right,
                    width: r.width,
                    height: dominantHeight,
                };
            }
            return r;
        });

        const allRects = [...expandedTextRects, ...expandedSymbolRects];

        const sorted = allRects.sort((a, b) => {
            if (Math.abs(a.top - b.top) > 2) return a.top - b.top;
            return a.left - b.left;
        });

        const merged: Rect[] = [];
        let current = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            const isSameLine = Math.abs(current.top - next.top) < 2 && Math.abs(current.bottom - next.bottom) < 2;
            const isAdjacent = next.left <= current.right + 4;

            if (isSameLine && isAdjacent) {
                current.right = Math.max(current.right, next.right);
                current.width = current.right - current.left;
                current.top = Math.min(current.top, next.top);
                current.bottom = Math.max(current.bottom, next.bottom);
                current.height = current.bottom - current.top;
            } else {
                merged.push({...current});
                current = {...next};
            }
        }
        merged.push(current);

        return merged;
    }

    function comparePositions(a: SelectionPosition, b: SelectionPosition): number {
        if (a.blockId !== b.blockId) {
            const aIdx = page.blocks.findIndex(bl => bl.id === a.blockId);
            const bIdx = page.blocks.findIndex(bl => bl.id === b.blockId);
            return aIdx - bIdx;
        }
        return a.offset - b.offset;
    }

    $effect(() => {
        if (!page.selection) {
            selectionRects = [];
            return;
        }

        // Handle block selection: highlight entire block content areas (excluding handle buttons)
        if (page.selection.isBlockSelection) {
            const endPos = page.selection.end ?? page.selection.start;
            const normalized = page.getNormalizedSelection({...page.selection, end: endPos});
            if (!normalized) {
                selectionRects = [];
                return;
            }

            const startBlockIdx = page.blocks.findIndex(b => b.id === normalized.start.blockId);
            const endBlockIdx = page.blocks.findIndex(b => b.id === normalized.end.blockId);

            const rects: Rect[] = [];
            // Skip block 0 (headline) in block selection highlight
            for (let i = Math.max(1, Math.min(startBlockIdx, endBlockIdx)); i <= Math.max(startBlockIdx, endBlockIdx); i++) {
                const block = page.blocks[i];
                const blockEl = document.querySelector(`[data-ziro-block-id="${block.id}"]`) as HTMLElement;
                if (!blockEl) continue;

                const flexRow = blockEl.querySelector('.flex.flex-row') as HTMLElement;
                if (!flexRow) continue;

                const handleEl = blockEl.querySelector('[data-ziro-editor-block-handle]') as HTMLElement;
                const handleWidth = handleEl ? handleEl.getBoundingClientRect().width : 0;

                const flexRect = flexRow.getBoundingClientRect();
                rects.push({
                    key: block.id,
                    top: flexRect.top,
                    bottom: flexRect.bottom,
                    left: flexRect.left + handleWidth,
                    right: flexRect.right,
                    width: flexRect.width - handleWidth,
                    height: flexRect.height
                });
            }

            selectionRects = rects;
            return;
        }

        const selection = window.getSelection();
        if (!selection) return;

        const startDOM = getDomNodeAndOffsetForPosition(page.selection.start);
        if (!startDOM) return;

        if (!page.selection.end) {
            // Use setBaseAndExtent instead of setPosition to avoid focus issues 
            // and ensure the range is correctly recognized by the browser for caret rendering.
            selection.setBaseAndExtent(startDOM.node, startDOM.offset, startDOM.node, startDOM.offset);
            selectionRects = [];
        } else {
            const endDOM = getDomNodeAndOffsetForPosition(page.selection.end);
            if (!endDOM) return;

            selection.setBaseAndExtent(startDOM.node, startDOM.offset, endDOM.node, endDOM.offset);

            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                selectionRects = getNormalizedSelectionRects(range, page.selection.start, page.selection.end);
            } else {
                selectionRects = [];
            }
        }
    })

    $effect(() => {
        const handleScroll = () => {
            if (!page.selection || !page.selection.end) return;
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                selectionRects = getNormalizedSelectionRects(selection.getRangeAt(0), page.selection.start, page.selection.end);
            }
        };

        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleScroll);
        };
    })

    const verticalPadding = 2;
</script>

{#each selectionRects as rect (rect.key)}
    <div
            transition:fade={{duration: page.selection?.isBlockSelection ? 100 : 0}}
            class="fixed bg-blue-400/30 rounded pointer-events-none mix-blend-multiply pb-2"
            style="
            top: {rect.top - (page.selection?.isBlockSelection ? 0 : 1) * verticalPadding}px;
            left: {rect.left}px;
            width: {rect.width}px;
            height: {rect.height + (page.selection?.isBlockSelection ? 1 : 2)*verticalPadding}px;
        "
    ></div>
{/each}

<svelte:document
        onmousedown={onMouseDown}
        onmousemove={onMouseMove}
        onmouseup={onMouseUp}
/>