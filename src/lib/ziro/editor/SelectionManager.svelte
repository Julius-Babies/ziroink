<script lang="ts">
    import type {Page, SelectionPosition} from "$lib/ziro/Page.svelte";
    import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";

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

        if (node) {
            let element: Element | null = null;
            if (node.nodeType === Node.TEXT_NODE) {
                const parent = node.parentElement;
                if (parent?.hasAttribute("data-ziro-editor-editable")) {
                    element = parent;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).hasAttribute("data-ziro-editor-editable")) {
                element = node as Element;
                offset = 0;
            }

            if (element) {
                const blockId = element.getAttribute("data-ziro-editor-editable-for-block-id");
                const inlineId = element.getAttribute("data-ziro-editor-editable-for-block-inline-id");
                if (blockId && inlineId) {
                    const block = page.findBlock(b => b.id === blockId);
                    if (block && block instanceof TextBlock) {
                        const blockOffset = block.findOffsetByInline(inlineId);
                        const inline = block.inlines.find(i => i.id === inlineId);
                        if (inline && inline instanceof InlineText) {
                            offset = Math.min(offset, inline.content.length);
                        }
                        return { blockId, offset: blockOffset + offset };
                    }
                }
            }
        }

        // Fallback: find the closest block by Y-coordinate if dragged outside editable areas
        const blocks = Array.from(document.querySelectorAll('[data-ziro-block-id]'));
        if (blocks.length === 0) return null;

        let closestBlock: Element | null = null;
        let minDistance = Infinity;

        for (const block of blocks) {
            const rect = block.getBoundingClientRect();
            
            if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
                closestBlock = block;
                break;
            }

            const distTop = Math.abs(e.clientY - rect.top);
            const distBottom = Math.abs(e.clientY - rect.bottom);
            const dist = Math.min(distTop, distBottom);

            if (dist < minDistance) {
                minDistance = dist;
                closestBlock = block;
            }
        }

        if (closestBlock) {
            const blockId = closestBlock.getAttribute("data-ziro-block-id");
            if (blockId) {
                const block = page.findBlock(b => b.id === blockId);
                if (block && block instanceof TextBlock) {
                    const rect = closestBlock.getBoundingClientRect();
                    
                    let targetOffset = 0;
                    if (e.clientY < rect.top) {
                        targetOffset = 0;
                    } else if (e.clientY > rect.bottom) {
                        targetOffset = block.getContentLength();
                    } else {
                        // Find the closest character offset by X within this block
                        // Alternatively, an approximation: if we dragged way to the right, we snap to end of line.
                        // For simplicity, we just check left/right half for block edge,
                        // but normally users expect end-of-line if they drag horizontally off the block.
                        const lastInline = block.inlines[block.inlines.length - 1];
                        if (lastInline instanceof InlineText) {
                            const inlineEl = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${lastInline.id}"]`) as HTMLElement;
                            if (inlineEl) {
                                const inlineRect = inlineEl.getBoundingClientRect();
                                if (e.clientX >= inlineRect.right) {
                                    targetOffset = block.getContentLength();
                                } else if (e.clientX <= inlineRect.left) {
                                    targetOffset = 0;
                                } else {
                                    targetOffset = e.clientX < rect.left + rect.width / 2 ? 0 : block.getContentLength();
                                }
                            } else {
                                targetOffset = e.clientX < rect.left + rect.width / 2 ? 0 : block.getContentLength();
                            }
                        } else {
                            targetOffset = e.clientX < rect.left + rect.width / 2 ? 0 : block.getContentLength();
                        }
                    }
                    
                    return { blockId, offset: targetOffset };
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
                page.setSelection({ blockId: pos.blockId, offset: startOffset }, { blockId: pos.blockId, offset: endOffset });
            }
            clickTimeout = setTimeout(() => clickCount = 0, 400);
            return;
        }

        if (clickCount === 3) {
            // Triple click: block selection
            const block = page.findBlock(b => b.id === pos.blockId);
            if (block instanceof TextBlock) {
                page.setSelection({ blockId: pos.blockId, offset: 0 }, { blockId: pos.blockId, offset: block.getContentLength() });
            }
            clickTimeout = setTimeout(() => clickCount = 0, 400);
            return;
        }

        clickTimeout = setTimeout(() => clickCount = 0, 400);

        isDragging = true;
        dragStartPos = pos;
        
        if (e.shiftKey && page.selection) {
            page.setSelection(page.selection.start, pos);
            dragStartPos = page.selection.start;
        } else {
            page.setSelection(pos, null);
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
            page.setSelection(dragStartPos, pos);
        } else {
            page.setSelection(dragStartPos, null);
        }
    }

    function onMouseUp(e: MouseEvent) {
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

        let { inline, offsetInInline } = block.findInlineAtOffset(pos.offset);
        
        // If we landed on a non-text inline, shift to an adjacent text inline for caret placement
        if (!(inline instanceof InlineText)) {
            const inlineIndex = block.inlines.findIndex(i => i.id === inline.id);
            if (offsetInInline === 0 && inlineIndex > 0) {
                const prev = block.inlines[inlineIndex - 1];
                if (prev instanceof InlineText) {
                    inline = prev;
                    offsetInInline = prev.content.length;
                }
            } else if (inlineIndex < block.inlines.length - 1) {
                const next = block.inlines[inlineIndex + 1];
                if (next instanceof InlineText) {
                    inline = next;
                    offsetInInline = 0;
                }
            } else {
                return null;
            }
        }

        // It might still not be an InlineText if there are multiple consecutive symbols
        if (!(inline instanceof InlineText)) return null;

        const inlineEditable = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${inline.id}"]`) as HTMLElement;
        if (!inlineEditable) return null;

        const anchorNode = inlineEditable.childNodes.item(0);
        if (!anchorNode) return null;

        return { node: anchorNode, offset: offsetInInline };
    }

    let selectionRects: Rect[] = $state([]);

    type Rect = { top: number, bottom: number, left: number, right: number, width: number, height: number };

    function getNormalizedSelectionRects(range: Range): Rect[] {
        const textRects: Rect[] = [];

        const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;
        if (!rootNode) return [];

        // Walk only the text nodes within the range and collect their rects
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

        const nodes: { node: Text, start: number, end: number }[] = [];
        let textNode: Node | null;
        while (textNode = treeWalker.nextNode()) {
            const text = textNode as Text;
            const nodeRange = document.createRange();
            nodeRange.selectNodeContents(text);
            if (range.compareBoundaryPoints(Range.END_TO_START, nodeRange) >= 0) continue;
            if (range.compareBoundaryPoints(Range.START_TO_END, nodeRange) <= 0) continue;

            const actualStart = (text === range.startContainer) ? range.startOffset : 0;
            const actualEnd = (text === range.endContainer) ? range.endOffset : text.length;

            nodes.push({ node: text, start: Math.min(actualStart, actualEnd), end: Math.max(actualStart, actualEnd) });
        }

        for (const { node, start, end } of nodes) {
            if (start >= end) continue;
            const charRange = document.createRange();
            charRange.setStart(node, start);
            charRange.setEnd(node, end);
            for (const rect of charRange.getClientRects()) {
                if (rect.width > 0 && rect.height > 0) {
                    textRects.push({
                        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
                        width: rect.width, height: rect.height
                    });
                }
            }
        }

        if (textRects.length === 0) return [];

        const sorted = textRects.sort((a, b) => {
            if (Math.abs(a.top - b.top) > 2) return a.top - b.top;
            return a.left - b.left;
        });

        const merged: Rect[] = [];
        let current = sorted[0];

        for (let i = 1; i < sorted.length; i++) {
            const next = sorted[i];
            const isSameLine = Math.abs(current.top - next.top) < 2 && Math.abs(current.bottom - next.bottom) < 2;
            const isAdjacent = next.left <= current.right + 1;

            if (isSameLine && isAdjacent) {
                current.right = Math.max(current.right, next.right);
                current.width = current.right - current.left;
                current.top = Math.min(current.top, next.top);
                current.bottom = Math.max(current.bottom, next.bottom);
                current.height = current.bottom - current.top;
            } else {
                merged.push({ ...current });
                current = { ...next };
            }
        }
        merged.push(current);

        return merged;
    }

    $effect(() => {
        if (!page.selection) {
            selectionRects = [];
            return;
        }

        const selection = window.getSelection();
        if (!selection) return;

        const startDOM = getDomNodeAndOffsetForPosition(page.selection.start);
        if (!startDOM) return;

        if (!page.selection.end) {
            selection.setPosition(startDOM.node, startDOM.offset);
            selectionRects = [];
        } else {
            const endDOM = getDomNodeAndOffsetForPosition(page.selection.end);
            if (!endDOM) return;
            
            // Allow reverse DOM selection using setBaseAndExtent
            selection.setBaseAndExtent(startDOM.node, startDOM.offset, endDOM.node, endDOM.offset);

            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                selectionRects = getNormalizedSelectionRects(range);
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
                selectionRects = getNormalizedSelectionRects(selection.getRangeAt(0));
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

{#each selectionRects as rect}
    <div
        class="fixed bg-blue-400/30 rounded pointer-events-none mix-blend-multiply"
        style="
            top: {rect.top - verticalPadding}px;
            left: {rect.left}px;
            width: {rect.width}px;
            height: {rect.height + 2*verticalPadding}px;
        "
    ></div>
{/each}

<svelte:document
        onmousedown={onMouseDown}
        onmousemove={onMouseMove}
        onmouseup={onMouseUp}
/>