<script lang="ts">
    import type {Page} from "$lib/ziro/Page.svelte";
    import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";

    let {
        page
    }: {
        page: Page
    } = $props();

    function createBlockAtEndAndFocus() {
        const block = new TextBlock(crypto.randomUUID());
        const inline = new InlineText(crypto.randomUUID())
        inline.content = "";
        block.inlines = [inline];
        page.insertBlock(block, { type: "end" });

        page.setSelection({blockId: block.id, offset: 0}, null)
    }

    function onClick() {
        if (page.blocks.length === 0) {
            createBlockAtEndAndFocus();
            return;
        }

        const block = page.blocks[page.blocks.length - 1];
        if (block instanceof TextBlock && block.getContentLength() === 0) {
            page.setSelection({blockId: block.id, offset: block.getContentLength()}, null)
        } else createBlockAtEndAndFocus();
    }
</script>

<button class="h-40 flex w-full flex-1 min-h-24" onclick={onClick} title="Neuer Textblock"></button>