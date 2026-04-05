<script lang="ts">
    import {Button} from "$lib/components/ui/button";
    import {Plus} from "@lucide/svelte";
    import { onMount } from "svelte";
    import { page } from "$app/state";
    import type {ApiPage} from "$lib/ziro/ApiPage";

    let {
        sidebarWidth = $bindable()
    }: {
        sidebarWidth: number
    } = $props();

    let isResizing = $state(false);
    
    // We derive local state from the layout load data
    let pages = $state<ApiPage[]>(page.data.pages || []);
    let titleSubscriptions = new Map<string, EventSource>();

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
            const newPage = JSON.parse(event.data);
            // Append and sort
            if (!pages.find(p => p.id === newPage.id)) {
                pages = [...pages, newPage].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            }
        };

        // SSE connection for real-time title updates
        const titleSource = new EventSource('/api/pages/title-sync');
        titleSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const p = pages.find(pg => pg.id === data.pageId);
            if (p) {
                p.title = data.title;
                pages = [...pages];
            }
        };

        return () => {
            source.close();
            titleSource.close();
        };
    });

    async function createPage() {
        const res = await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            const newPage = await res.json();
            // Optional: The EventSource will pick this up automatically for other tabs!
            // We can optimistic update here, or wait for SSE. SSE is so fast we'll just wait for it.
            // Actually, optimistic is nice. Let's do both with a dedupe.
            if (!pages.find(p => p.id === newPage.id)) {
                pages = [...pages, newPage].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
            }
        }
    }
</script>

<svelte:window onmousemove={isResizing ? onMouseMove : null} onmouseup={isResizing ? onMouseUp : null} />

<div
        class="h-full border-r relative shrink-0 bg-zinc-100"
        style="width: {sidebarWidth}px"
>
    <div class="p-4 flex flex-col h-full overflow-hidden">
        <div class="flex flex-row items-center justify-between mb-4">
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
        <div class="flex flex-col gap-1 overflow-y-auto">
            {#each pages as p (p.id)}
                <a 
                    href="/app/{p.id}"
                    class="px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-200 rounded truncate block"
                    class:bg-zinc-200={page.url.pathname === `/app/${p.id}`}
                >
                    {p.title}
                </a>
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