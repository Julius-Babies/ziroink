<script lang="ts">
    import type {TextBlock} from "$lib/ziro/TextBlock.svelte";
    import {Kbd, KbdGroup} from "$lib/components/ui/kbd";

    let {
        block,
    }: {
        block: TextBlock
    } = $props();
</script>

<div class="absolute left-0 top-0 text-gray-400 pointer-events-none select-none">
    {#if block.variant === "paragraph"}
        Tippen, oder <KbdGroup><Kbd>/</Kbd></KbdGroup> für Blöcke
    {:else if block.variant === "h1"}
        Hauptüberschrift
    {:else if block.variant === "h2"}
        Überschrift 2
    {:else if block.variant === "h3"}
        Überschrift 3
    {:else if block.variant === "h4"}
        Überschrift 4
    {:else if block.variant === "h5"}
        Überschrift 5
    {:else if block.variant === "h6"}
        Überschrift 6
    {/if}
</div>