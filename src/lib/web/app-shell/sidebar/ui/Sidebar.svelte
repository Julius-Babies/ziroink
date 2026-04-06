<script lang="ts">
    import {Button} from "$lib/components/ui/button";
    import {Plus} from "@lucide/svelte";
    import {onMount} from "svelte";
    import {page} from "$app/state";
    import PageItem from "$lib/web/app-shell/sidebar/ui/PageItem.svelte";
    import {goto} from "$app/navigation";
    import {sidebarService} from "$lib/web/app-shell/sidebar/service/SidebarService";
    import type {ApiPage} from "$lib/web/app-shell/sidebar/model/ApiPage";

    let {
        sidebarWidth = $bindable()
    }: {
        sidebarWidth: number
    } = $props();

    let isResizing = $state(false);
    
    function onMouseDown() {
        isResizing = true;
    }

    function onMouseMove(e: MouseEvent) {
        if (!isResizing) return;

        sidebarWidth = Math.max(150, Math.min(e.clientX, 400))
    }

    function onMouseUp() {
        isResizing = false
    }

    let pages: ApiPage[] = $state([])

    onMount(() => {
        const unsubscriber = sidebarService.getAll().subscribe(value => pages = value)
        return () => {
            unsubscriber()
            sidebarService.close()
        };
    });

    async function createPage() {
        const result = await sidebarService.create();
        await goto("/app/" + result.page_id)
    }
</script>

<svelte:window onmousemove={isResizing ? onMouseMove : null} onmouseup={isResizing ? onMouseUp : null} />

<div
        class="h-full border-r relative shrink-0 bg-slate-100"
        style="width: {sidebarWidth}px"
>
    <div class="p-2 flex flex-col h-full overflow-hidden">
        <div class="flex flex-row items-center justify-between mb-4 p-2">
            <span class="text-xs font-medium text-zinc-800">Deine Seiten</span>
            <Button
                    size="icon-sm"
                    variant="ghost"
                    onclick={createPage}
            >
                <Plus />
            </Button>
        </div>
        
        <!-- Pages List -->
        <div class="flex flex-col overflow-y-auto">
            {#each pages as p (p.id)}
                <PageItem
                        currentUrl={page.url.pathname}
                        page={p}
                />
            {:else}
                <div class="text-xs text-zinc-400 italic py-2">No pages found</div>
            {/each}
        </div>
    </div>
    <div
            class="w-1.5 h-full top-0 -right-1 bg-blue-300/30 opacity-0 hover:opacity-100 transition-opacity cursor-ew-resize absolute z-10"
            onmousedown={onMouseDown}
            role="button"
            tabindex="-1"
    ></div>
</div>