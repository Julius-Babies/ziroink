<script lang="ts">
    import {TextBlock} from "$lib/ziro/TextBlock.svelte";
    import type {Page} from "$lib/ziro/Page.svelte";
    import {Check} from "@lucide/svelte";

    let {
        block,
        page
    }: {
        block: TextBlock,
        page: Page
    } = $props();

    function toggleCheckbox() {
        if (block.listStyle?.type !== "checkbox") return;

        page.updateBlockList(block.id, "unordered", { type: "checkbox", checked: !block.listStyle.checked })
    }
</script>
{#if block.listStyle}
    <div class="w-8 flex justify-center items-center select-none h-lh">
        {#if block.listStyle.type === "bullet"}
            <span>&bullet;</span>
        {:else if block.listStyle.type === "dash"}
            <span>&dash;</span>
        {:else if block.listStyle.type === "arrow"}
            <span>-></span>
        {:else if block.listStyle.type === "ordered"}
            <span>{block.getOrderedMarker(page)}</span>
        {:else if block.listStyle.type === "checkbox"}
            <button
                    role="checkbox"
                    aria-checked={block.listStyle.checked}
                    onclick={toggleCheckbox}
                    class="w-4 h-4 border border-black flex items-center justify-center cursor-pointer"
            >
                {#if block.listStyle.checked}
                    <Check />
                {/if}
            </button>
        {/if}
    </div>
{/if}