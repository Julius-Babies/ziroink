<script lang="ts">
    import type {Page} from "$lib/ziro/Page.svelte";
    import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";

    let {
        page,
    }: {
        page: Page
    } = $props();

    function onSelectionChange() {
        const domSelection = window.document.getSelection();
        if (!domSelection) return;

        const startNode = domSelection.anchorNode?.parentElement;

        if (!startNode) return;
        if (!startNode.hasAttribute("data-ziro-editor-editable")) return;

        const blockId = startNode.getAttribute("data-ziro-editor-editable-for-block-id");
        if (!blockId) return;

        const block = page.findBlock(b => b.id === blockId);
        if (!block) throw new Error(`Cursor positioned in block ${blockId}; block was not found in page`);

        if (block instanceof TextBlock) {
            const inlineId = startNode.getAttribute("data-ziro-editor-editable-for-block-inline-id")!;
            const blockOffset = block.findOffsetByInline(inlineId);
            const inlineOffset = domSelection.anchorOffset;
            const resultingOffset = blockOffset + inlineOffset;
            page.setSelection({blockId, offset: resultingOffset}, null);
        } else {
            // TODO
            throw new Error("Non-text blocks are not yet supported")
        }
    }

    function onMouseDown() {
        page.cursorXPosition = null;
    }

    $effect(() => {
        if (!page.selection || page.selection.end) return;

        const block = page.findBlock(b => b.id === page.selection?.start.blockId);
        if (!block) return;

        if (block instanceof TextBlock) {
            const {inline, offsetInInline} = block.findInlineAtOffset(page.selection.start.offset);
            if (inline instanceof InlineText) {
                const inlineEditable = document.querySelector(`[data-ziro-editor-editable-for-block-inline-id="${inline.id}"]`) as HTMLElement;
                if (!inlineEditable) return;

                const anchorNode = inlineEditable.childNodes.item(0);

                const selection = window.getSelection()!;
                selection.setPosition(anchorNode, offsetInInline);
            }
        } else {
            throw new Error("Non-text blocks are not yet supported")
        }
    })
</script>

<svelte:document
        onselectionchange={onSelectionChange}
        onmousedown={onMouseDown}
/>