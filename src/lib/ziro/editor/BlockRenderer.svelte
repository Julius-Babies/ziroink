<script lang="ts">
    import type {Block} from "$lib/ziro/Block";
    import type {Page} from "$lib/ziro/Page.svelte";
    import {InlineSymbol, InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
    import Editable from "$lib/ziro/editor/Editable.svelte";
    import InlineSymbolRenderer from "$lib/ziro/editor/InlineSymbolRenderer.svelte";
    import PlaceholderRenderer from "$lib/ziro/editor/PlaceholderRenderer.svelte";
    import ListIndicator from "$lib/ziro/editor/ListIndicator.svelte";
    import {GripVertical, Plus} from "@lucide/svelte";

    let {
        block,
        page,
        isPageTitle,
    }: {
        block: Block,
        page: Page,
        isPageTitle: boolean,
    } = $props();

    function getVariantClass(block: TextBlock) {
        switch (block.variant) {
            case "h1": return "text-4xl font-bold mt-6";
            case "h2": return "text-3xl font-bold mt-5";
            case "h3": return "text-2xl font-bold mt-4";
            case "h4": return "text-xl font-bold mt-3";
            case "h5": return "text-lg font-bold mt-2";
            case "h6": return "text-base font-bold mt-2";
            default: return "mt-1";
        }
    }

    let isFocused = $derived(page.selection?.start.blockId === block.id);
    let isEmpty = $derived(block instanceof TextBlock && block.getContentLength() === 0);
    let showPlaceholder = $derived(isFocused && isEmpty);
    let isHovering = $state(false);
</script>

{#if block instanceof TextBlock}
    <div
            tabindex="-1"
            role="textbox"
            onmouseenter={() => isHovering = true}
            onmouseleave={() => isHovering = false}
            class="relative w-full shrink-0 min-h-[1.5em] {getVariantClass(block)}"
            data-ziro-block-id={block.id}
    >
        <div class="flex flex-row w-full">
            <div
                    data-ziro-editor-block-handle
                    class="flex flex-row items-end justify-center text-zinc-600 gap-2 pr-2 transition-opacity"
                    class:opacity-0={!isHovering || isPageTitle}
                    class:opacity-100={isHovering && !isPageTitle}
                    class:pointer-events-none={isPageTitle}
            >
                <button class="cursor-pointer"><Plus size={22} /></button>
                <button
                        class="cursor-grab"
                        onclick={() => {
                            if (isPageTitle) return;
                            page.setSelection({blockId: block.id, offset: 0}, {blockId: block.id, offset: 0}, true)
                        }}
                ><GripVertical size={22} /></button>
            </div>
            <div
                    class="inline-flex w-full"
                    style="margin-left: {((block.indentLevel) - ((block.listType) ? 1 : 0)) * 32}px;"
            >
                {#if (block.listType)}
                    <ListIndicator block={block} page={page} />
                {/if}
                <div class="grow relative min-h-[1.5em] cursor-text">
                    {#if showPlaceholder}
                        <PlaceholderRenderer block={block} />
                    {/if}
                    {#each (block.inlines) as inline, index (inline.id)}{#if index === 0 && !(inline instanceof InlineText)}<Editable
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
                            code={inline.code}
                    />{:else if inline instanceof InlineSymbol}<InlineSymbolRenderer symbol={inline} blockId={block.id} variant={block.variant} />{/if}{#if index === block.inlines.length - 1 && !(inline instanceof InlineText)}<Editable
                            inlineId={inline.id}
                            type="inline"
                            blockId={block.id}
                            page={page}
                            content=""
                    />{/if}{/each}
                </div>
            </div>
        </div>
    </div>
{/if}