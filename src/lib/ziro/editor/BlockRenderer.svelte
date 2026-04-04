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
</script>

<div class="w-full mt-2" data-ziro-block-id={block.id}>{#if block instanceof TextBlock}{#each block.inlines as inline, index (inline.id)}{#if index === 0 && !(inline instanceof InlineText)}<Editable
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
                />{/if}{/each}{/if}</div>