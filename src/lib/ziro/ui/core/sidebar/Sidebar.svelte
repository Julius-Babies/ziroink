<script lang="ts">
    import {Button} from "$lib/components/ui/button";
    import {Plus} from "@lucide/svelte";
    import {onMount} from "svelte";
    import {page} from "$app/state";
    import type {ApiPage} from "$lib/ziro/ApiPage";
    import PageItem from "$lib/ziro/ui/core/sidebar/PageItem.svelte";
    import {goto} from "$app/navigation";
    import type {EventWithType} from "../../../../../routes/api/pages/sync/+server";

    let {
        sidebarWidth = $bindable()
    }: {
        sidebarWidth: number
    } = $props();

    let isResizing = $state(false);
    
    // We derive local state from the layout load data
    let pages = $state<ApiPage[]>(page.data.pages || []);

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

    onMount(() => {
        // Init pages from load state explicitly to be safe
        pages = page.data.pages || [];

        // SSE connection to sync pages in real-time
        const source = new EventSource('/api/pages/sync');
        source.onmessage = (event) => {
            const eventData: EventWithType = JSON.parse(event.data);
            if (eventData.type === "new_page") {
                if (!pages.find(p => p.id === eventData.page_id)) {
                    const newApiPage: ApiPage = {
                        id: eventData.page_id,
                        created_at: new Date(eventData.created_at),
                        title: eventData.page_title,
                    }
                    pages = [...pages, newApiPage].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
                }
            } else if (eventData.type === "page_metadata_changed") {
                pages = pages.map(page => {
                    if (page.id !== eventData.page_id) return page;

                    let changedPage = page;

                    if (eventData.new_title !== undefined) {
                        changedPage.title = eventData.new_title;
                    }

                    return changedPage;
                })
            } else if (eventData.type === "page_deleted") {
                pages = pages.filter(p => p.id !== eventData.page_id);
            }
        };

        return () => {
            source.close();
        };
    });

    async function createPage() {
        const res = await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            const newPage = {...await res.json(), title: "Unbenannte Seite"};
            // Optional: The EventSource will pick this up automatically for other tabs!
            // We can optimistic update here, or wait for SSE. SSE is so fast we'll just wait for it.
            // Actually, optimistic is nice. Let's do both with a dedupe.
            if (!pages.find(p => p.id === newPage.id)) {
                pages = [...pages, newPage].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            }

            await goto("/app/" + newPage.id)
        }
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