<script lang="ts">
    import type {InlineSymbol} from "$lib/ziro/TextBlock.svelte";
    import {Check, X} from "@lucide/svelte";

    let {
        symbol,
    }: {
        symbol: InlineSymbol
    } = $props();
</script>

{#if symbol.symbol === "check"}<div
        class="inline-flex rounded-full bg-green-700 text-white w-4 h-4 items-center justify-center"
><Check size={12} /></div>{:else if symbol.symbol === "x"}<div
        class="inline-flex rounded-full bg-red-700 text-white w-4 h-4 items-center justify-center"
><X size={12} /></div>{:else if symbol.symbol === "question_mark"}<div
        class="inline-flex rounded-full bg-blue-700 text-white w-4 h-4 items-center justify-center"
>?</div>{/if}