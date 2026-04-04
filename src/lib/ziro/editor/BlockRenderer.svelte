<script lang="ts">
    import type {Block} from "$lib/ziro/Block";
    import type {Page} from "$lib/ziro/Page.svelte";
    import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
    import Editable from "$lib/ziro/editor/Editable.svelte";

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

    function getPlaceholderText(block: TextBlock) {
        if (block.variant === "paragraph") return "Tippen, oder / für Befehle";
        if (block.variant === "h1") return "Überschrift 1";
        if (block.variant === "h2") return "Überschrift 2";
        if (block.variant === "h3") return "Überschrift 3";
        if (block.variant === "h4") return "Überschrift 4";
        if (block.variant === "h5") return "Überschrift 5";
        if (block.variant === "h6") return "Überschrift 6";
        return "";
    }
</script>

{#if block instanceof TextBlock}
    <div class="relative w-full min-h-[1.5em] {getVariantClass(block)}" style="margin-left: {block.indentLevel * 32}px;" data-ziro-block-id={block.id}>
        {#if showPlaceholder}
            <div class="absolute left-0 top-0 text-gray-400 pointer-events-none select-none">{getPlaceholderText(block)}</div>
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
                />{/if}{#if index === block.inlines.length - 1 && !(inline instanceof InlineText)}<Editable
                        inlineId={inline.id}
                        type="inline"
                        blockId={block.id}
                        page={page}
                        content=""
                />{/if}{/each}</div>{/if}