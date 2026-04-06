<script lang="ts">
    import type {ApiPage} from "$lib/ziro/ApiPage";
    import {
        ContextMenu,
        ContextMenuContent,
        ContextMenuItem,
        ContextMenuTrigger
    } from "$lib/components/ui/context-menu";
    import {EllipsisVertical, Trash} from "@lucide/svelte";
    import {Button} from "$lib/components/ui/button";

    let {
        page,
        currentUrl,
    }: {
        page: ApiPage,
        currentUrl: string,
    } = $props();

    let contextMenuVisible = $state(false);

    function onContextMenuButtonClick(e: MouseEvent) {
        e.preventDefault();
        const target = e.currentTarget as HTMLElement;
        const trigger = target.closest('[data-context-menu-trigger]');
        trigger?.dispatchEvent(new MouseEvent('contextmenu', {
            bubbles: true,
            clientX: e.clientX,
            clientY: e.clientY,
        }));
    }

    async function deletePage() {
        const response = await fetch(`/api/pages/${page.id}`, {
            method: 'DELETE',
        });
    }
</script>

<ContextMenu bind:open={contextMenuVisible}>
    <ContextMenuTrigger>
        <a
                href="/app/{page.id}"
                class="px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-300 rounded truncate block tracking-tight font-medium transition-colors"
                class:bg-zinc-200={currentUrl === `/app/${page.id}`}
        >
            <div class="flex flex-row items-center justify-between">
                <div class="flex flex-row items-center">
                    <span>{page.title}</span>
                </div>
                <div class="flex flex-row items-center">
                    <Button
                            onclick={onContextMenuButtonClick}
                            size="icon-sm"
                            variant="ghost"
                    >
                        <EllipsisVertical />
                    </Button>
                </div>
            </div>
        </a>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-52">
        <ContextMenuItem
                onclick={deletePage}
                class="text-destructive"
        >
            <Trash />
            Löschen
        </ContextMenuItem>
    </ContextMenuContent>
</ContextMenu>