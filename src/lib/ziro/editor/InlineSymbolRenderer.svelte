<script lang="ts">
    import type {InlineSymbol, TextBlockVariant} from "$lib/ziro/TextBlock.svelte";
    import {Check, X} from "@lucide/svelte";

    let {
        symbol,
        blockId,
        variant,
    }: {
        symbol: InlineSymbol,
        blockId: string,
        variant: TextBlockVariant,
    } = $props();

    const sizeMap: Record<TextBlockVariant, { container: string, icon: number }> = {
        h1: { container: "w-8 h-8", icon: 24 },
        h2: { container: "w-7 h-7", icon: 20 },
        h3: { container: "w-6 h-6", icon: 16 },
        h4: { container: "w-5 h-5", icon: 14 },
        h5: { container: "w-[18px] h-[18px]", icon: 13 },
        h6: { container: "w-4 h-4", icon: 12 },
        paragraph: { container: "w-4 h-4", icon: 12 },
    };

    const size = $derived(sizeMap[variant] ?? sizeMap.paragraph);
</script>

<div
        class="inline-flex cursor-text align-middle"
        data-ziro-editor-editable
        data-ziro-editor-editable-for-block-id={blockId}
        data-ziro-editor-editable-for-block-inline-id={symbol.id}
>
    {#if symbol.symbol.type === "check"}
        <div
                class="inline-flex rounded-full bg-green-700 text-white items-center justify-center {size.container}"
        >
            <Check size={size.icon}/>
        </div>
    {:else if symbol.symbol.type === "x"}
        <div
                class="inline-flex rounded-full bg-red-700 text-white items-center justify-center {size.container}"
        >
            <X size={size.icon}/>
        </div>
    {:else if symbol.symbol.type === "question_mark"}
        <div
                class="inline-flex rounded-full bg-blue-700 text-white items-center justify-center {size.container}"
        >?
        </div>
    {:else if symbol.symbol.type === "emoji"}
        <span class="emoji text-lg leading-none select-none">{symbol.symbol.emoji}</span>
    {/if}
</div>