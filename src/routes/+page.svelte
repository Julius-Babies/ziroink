<script lang="ts">
    import {JsonView} from "@zerodevx/svelte-json-view";
    import {Page} from "$lib/ziro/Page.svelte";
    import BottomWhitespace from "$lib/ziro/editor/BottomWhitespace.svelte";
    import BlockRenderer from "$lib/ziro/editor/BlockRenderer.svelte";
    import SelectionManager from "$lib/ziro/editor/SelectionManager.svelte";
    import {KeyboardHandler} from "$lib/ziro/KeyboardHandler";
    import {onMount} from "svelte";

    let page = $state(new Page());
    let keyboardHandler: KeyboardHandler | null = $state(null);

    onMount(() => {
        keyboardHandler = new KeyboardHandler(page);
    })
</script>

<div class="w-full h-full flex flex-row">
    <div
            class="h-full flex-1 flex flex-col overflow-y-auto"
            onkeydown={e => keyboardHandler?.onEvent?.(e)}
            role="textbox"
            tabindex="-1"
    >
        {#each page.blocks as block (block.id)}
            <BlockRenderer
                    block={block}
                    page={page}
            />
        {/each}
        <BottomWhitespace page={page}/>
    </div>
    <div class="h-full flex-1 overflow-y-auto">
        <JsonView json={{selection: page.selection, blocks: page.blocks.map(b => b.toObject())}}/>
    </div>
</div>

<SelectionManager page={page} />
