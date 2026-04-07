<script lang="ts">
    import type {Page} from "$lib/ziro/Page.svelte";
    import {TextBlock} from "$lib/ziro/TextBlock.svelte";

    let {
        page
    }: {
        page: Page
    } = $props();

    function onClick() {
        if (page.blocks.length === 0) {
            const blockId = page.createEmptyBlockAtEnd();
            page.setSelection({blockId, offset: 0}, null);
            return;
        }

        const block = page.blocks[page.blocks.length - 1];
        if (block instanceof TextBlock && block.getContentLength() === 0) {
            page.setSelection({blockId: block.id, offset: block.getContentLength()}, null)
        } else {
            const blockId = page.createEmptyBlockAtEnd();
            page.setSelection({blockId, offset: 0}, null);
        }
    }
</script>

<button class="h-40 flex w-full flex-1 min-h-24" onclick={onClick} title="Neuer Textblock"></button>