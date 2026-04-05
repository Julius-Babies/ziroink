<script lang="ts">
    import type {Block} from "$lib/ziro/Block";
    import type {Page} from "$lib/ziro/Page.svelte";
    import {InlineSymbol, InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
    import Editable from "$lib/ziro/editor/Editable.svelte";
    import InlineSymbolRenderer from "$lib/ziro/editor/InlineSymbolRenderer.svelte";
    import PlaceholderRenderer from "$lib/ziro/editor/PlaceholderRenderer.svelte";
    import ListIndicator from "$lib/ziro/editor/ListIndicator.svelte";

    let {
        block,
        page,
    }: {
        block: Block,
        page: Page
    } = $props();

    function getVariantClass(block: TextBlock) {
        switch (block.variant) {
            case "h1": return "text-4xl font-bold mt-6 mb-2";
            case "h2": return "text-3xl font-bold mt-5 mb-2";
            case "h3": return "text-2xl font-bold mt-4 mb-1";
            case "h4": return "text-xl font-bold mt-3 mb-1";
            case "h5": return "text-lg font-bold mt-2 mb-1";
            case "h6": return "text-base font-bold mt-2 mb-1";
            default: return "mt-2";
        }
    }

    let isFocused = $derived(page.selection?.start.blockId === block.id);
    let isEmpty = $derived(block instanceof TextBlock && block.getContentLength() === 0);
    let showPlaceholder = $derived(isFocused && isEmpty);

    function toRoman(num: number): string {
        const lookup: Record<string, number> = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
        let roman = '';
        for (let i in lookup) {
            while (num >= lookup[i]) {
                roman += i;
                num -= lookup[i];
            }
        }
        return roman;
    }
</script>

{#if block instanceof TextBlock}
    <div class="relative w-full shrink-0 min-h-[1.5em] {getVariantClass(block)}" style="margin-left: {(block.indentLevel - (block.listType ? 1 : 0)) * 32}px;" data-ziro-block-id={block.id}>
        <div class="flex flex-row w-full">
            {#if block.listType}
                <ListIndicator block={block} page={page} />
            {/if}
            <div class="grow relative min-h-[1.5em]">
                {#if showPlaceholder}
                    <PlaceholderRenderer block={block} />
                {/if}
                {#each block.inlines as inline, index (inline.id)}{#if index === 0 && !(inline instanceof InlineText)}<Editable
                                inlineId={inline.id}
                                type="inline"
                                blockId={block.id}
                                page={page}
                                content=""
                        />{/if}{#if inline instanceof InlineText}<Editable
                                inlineId={inline.id}
                                type="inline"
                                blockId={block.id}
                                page={page}
                                content={inline.content}
                                bold={inline.bold}
                                italic={inline.italic}
                                underline={inline.underline}
                                strikethrough={inline.strikethrough}
                        />{:else if inline instanceof InlineSymbol}<InlineSymbolRenderer symbol={inline} />{/if}{#if index === block.inlines.length - 1 && !(inline instanceof InlineText)}<Editable
                                inlineId={inline.id}
                                type="inline"
                                blockId={block.id}
                                page={page}
                                content=""
                        />{/if}{/each}
            </div>
        </div>
    </div>
{/if}