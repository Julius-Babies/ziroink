<script lang="ts">
    import {showPageDeveloperDetails} from "../state";
    import {Tabs, TabsList, TabsTrigger} from "$lib/components/ui/tabs";
    import {JsonView} from "@zerodevx/svelte-json-view";
    import { fly } from "svelte/transition";
    import { ClientFactory } from "$lib/ziro/client/ClientModels.svelte";
    import { generateKeyBetween } from "fractional-indexing";
    import { KeyboardHandler } from "$lib/ziro/editor/keyboard/KeyboardHandler";
    import BlockRenderer from "$lib/ziro/editor/BlockRenderer.svelte";
    import BottomWhitespace from "$lib/ziro/editor/BottomWhitespace.svelte";
    import SelectionManager from "$lib/ziro/editor/SelectionManager.svelte";
    import { onMount } from "svelte";
    import { v4 as uuidv4 } from "uuid";

    let { data } = $props();

    let visibleDevTab: "document_tree" | "sync_queue" = $state("document_tree");

    function loadPageFromDB() {
        const factory = new ClientFactory();
        const p = factory.createPage();
        
        if (data.blocks && data.blocks.length > 0) {
            let lastValidBlockSortKey: string | null = null;
            const reconstructedBlocks = data.blocks.map((dbBlock: any) => {
                const block = factory.createTextBlock(dbBlock.id);
                (block as any).variant = dbBlock.variant;
                (block as any).indentLevel = dbBlock.indentLevel;
                if (dbBlock.listType) {
                    (block as any).listType = dbBlock.listType;
                    (block as any).listStyle = {
                        type: dbBlock.listStyleType,
                        prefix: dbBlock.listStylePrefix,
                        suffix: dbBlock.listStyleSuffix,
                        variant: dbBlock.listStyleVariant
                    };
                }
                
                let bSortKey = dbBlock.sortKey;
                if (!bSortKey || bSortKey === "0") {
                    bSortKey = generateKeyBetween(lastValidBlockSortKey, null);
                }
                (block as any).sortKey = bSortKey;
                lastValidBlockSortKey = bSortKey;

                const inlines = Array.isArray(dbBlock.content) ? dbBlock.content : [];
                let lastValidInlineSortKey: string | null = null;
                block.inlines = inlines.map((inl: any, index: number) => {
                    let inlSortKey = inl.sortKey;
                    if (!inlSortKey || inlSortKey === "0") {
                        inlSortKey = generateKeyBetween(lastValidInlineSortKey, null);
                    }
                    lastValidInlineSortKey = inlSortKey;
                    
                    if (inl.symbolType) {
                        const sym = factory.createInlineSymbol({ type: inl.symbolType, emoji: inl.emoji }, inl.id);
                        sym.sortKey = inlSortKey;
                        return sym;
                    } else {
                        const textInl = factory.createInlineText(inl.id);
                        textInl.content = inl.content || "";
                        textInl.bold = inl.bold || false;
                        textInl.italic = inl.italic || false;
                        textInl.underline = inl.underline || false;
                        textInl.strikethrough = inl.strikethrough || false;
                        textInl.code = inl.code || false;
                        textInl.sortKey = inlSortKey;
                        return textInl;
                    }
                });

                if (block.inlines.length === 0) {
                    const emptyInl = factory.createInlineText();
                    emptyInl.content = "";
                    block.inlines = [emptyInl];
                }

                return block;
            });
            p.setBlocks(reconstructedBlocks);
        } else {
            // First time opening an empty page - initialize a title block
            const titleBlock = factory.createTextBlock();
            (titleBlock as any).variant = "h1";
            (titleBlock as any).sortKey = "a0"; // Default starting key
            const emptyInl = factory.createInlineText();
            emptyInl.content = "";
            (emptyInl as any).sortKey = "a0";
            titleBlock.inlines = [emptyInl];
            p.setBlocks([titleBlock]);
        }
        
        p.clearEventQueue();
        return p;
    }

    let clientId: string = "";

    let page = $state(loadPageFromDB());
    let keyboardHandler: KeyboardHandler | null = $state(null);

    let isSyncing = $state(false);

    async function syncChanges() {
        if (!clientId || isSyncing || page.eventQueue.length === 0) return;
        
        isSyncing = true;
        const eventsToSync = [...page.eventQueue];
        page.clearEventQueue();

        // Figure out which blocks need to be updated
        const modifiedBlockIds = new Set<string>();
        for (const event of eventsToSync) {
            if ('blockId' in event) modifiedBlockIds.add(event.blockId);
            if (event.type === "block_merged") modifiedBlockIds.add(event.targetBlockId);
            if (event.type === "block_split") {
                modifiedBlockIds.add(event.oldBlockId);
                modifiedBlockIds.add(event.newBlockId);
            }
        }

        const modifiedBlocks = page.blocks
            .filter(b => modifiedBlockIds.has(b.id))
            .map(b => b.toObject());

        try {
            await fetch(`/api/pages/${data.page.id}/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ events: eventsToSync, modifiedBlocks, clientId })
            });
        } catch (e) {
            console.error("Sync failed", e);
            // Push events back to queue for next tick
            page.eventQueue.unshift(...eventsToSync);
        } finally {
            isSyncing = false;
        }
    }

    function handleExternalSync(payload: any) {
        if (payload.clientId === clientId) return;

        const factory = new ClientFactory();
        
        // Handle deletions
        if (payload.deletedBlockIds && payload.deletedBlockIds.length > 0) {
            const set = new Set(payload.deletedBlockIds);
            page.blocks = page.blocks.filter(b => !set.has(b.id));
        }

        // Handle updates and insertions
        if (payload.modifiedBlocks && payload.modifiedBlocks.length > 0) {
            for (const dbBlock of payload.modifiedBlocks) {
                let block = page.blocks.find(b => b.id === dbBlock.id);
                let isNew = false;
                
                if (!block) {
                    block = factory.createTextBlock(dbBlock.id);
                    isNew = true;
                }
                
                // Assert it as any so we can assign dynamic properties smoothly
                const anyBlock = block as any;

                anyBlock.variant = dbBlock.variant;
                anyBlock.indentLevel = dbBlock.indentLevel;
                if (dbBlock.listType) {
                    anyBlock.listType = dbBlock.listType;
                    if (dbBlock.listStyle) {
                        anyBlock.listStyle = { ...dbBlock.listStyle };
                    } else {
                        // Fallback in case it's a DB record format
                        anyBlock.listStyle = {
                            type: dbBlock.listStyleType,
                            prefix: dbBlock.listStylePrefix,
                            suffix: dbBlock.listStyleSuffix,
                            variant: dbBlock.listStyleVariant
                        };
                    }
                } else {
                    anyBlock.listType = null;
                    anyBlock.listStyle = null;
                }
                anyBlock.sortKey = dbBlock.sortKey && dbBlock.sortKey !== "0" ? dbBlock.sortKey : generateKeyBetween(null, null);

                const inlines = Array.isArray(dbBlock.inlines) ? dbBlock.inlines : (Array.isArray(dbBlock.content) ? dbBlock.content : []);
                
                anyBlock.inlines = inlines.map((inl: any) => {
                    let inlSortKey = inl.sortKey && inl.sortKey !== "0" ? inl.sortKey : generateKeyBetween(null, null);
                    if (inl.symbolType) {
                        const sym = factory.createInlineSymbol({ type: inl.symbolType, emoji: inl.emoji }, inl.id);
                        sym.sortKey = inlSortKey;
                        return sym;
                    } else {
                        const textInl = factory.createInlineText(inl.id);
                        textInl.content = inl.content || "";
                        textInl.bold = inl.bold || false;
                        textInl.italic = inl.italic || false;
                        textInl.underline = inl.underline || false;
                        textInl.strikethrough = inl.strikethrough || false;
                        textInl.code = inl.code || false;
                        textInl.sortKey = inlSortKey;
                        return textInl;
                    }
                });

                if (anyBlock.inlines.length === 0) {
                    const emptyInl = factory.createInlineText();
                    emptyInl.content = "";
                    anyBlock.inlines = [emptyInl];
                }

                if (isNew) {
                    page.blocks.push(block!);
                }
            }
            
            // Re-sort all blocks based on sortKey
            page.blocks.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        }
    }

    let eventSource: EventSource | null = null;

    $effect(() => {
        if (!data.page.id) return;
        clientId = uuidv4();
        keyboardHandler = new KeyboardHandler(page);
        const interval = setInterval(syncChanges, 500);

        eventSource = new EventSource(`/api/pages/${data.page.id}/events`);
        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                handleExternalSync(payload);
            } catch (err) {
                console.error("Error processing SSE", err);
            }
        };

        return () => {
            clearInterval(interval);
            eventSource?.close();
        };
    })

</script>

<svelte:window
        oncompositionendcapture={e => keyboardHandler?.onCompositionEnd(e)}
        onkeydowncapture={e => keyboardHandler?.onEvent(e)}
        onbeforeinputcapture={e => keyboardHandler?.onBeforeInput(e)}
        onpastecapture={e => keyboardHandler?.onPaste(e)}
/>

<div class="w-full h-full flex flex-row bg-white overflow-x-clip">

    <div
            spellcheck="false"
            class="h-full flex-1 flex flex-col overflow-y-auto px-12 py-8 pt-16"
            role="textbox"
            tabindex="-1"
    >
        {#each (page.blocks) as block (block.id)}
            <BlockRenderer
                    block={block}
                    page={page}
            />
        {/each}
        <BottomWhitespace page={page}/>
    </div>
    
    <SelectionManager page={page}/>

    {#if $showPageDeveloperDetails}
        <div
                transition:fly={{x: 500}}
                class="h-full flex relative flex-1 bg-gray-50 border-l border-gray-200"
        >
            <div class="absolute top-0 left-0 flex flex-col w-full h-full p-4 overflow-y-auto pt-28">
                {#if visibleDevTab === "document_tree"}
                    <JsonView json={{
                cursorX: page.cursorXPosition,
                selection: page.selection,
                blocks: page.blocks.map(b => b.toObject())
            }}/>
                {:else if visibleDevTab === "sync_queue"}
                    <JsonView json={page.eventQueue}/>
                {/if}
            </div>

            <div class="absolute top-0 left-0 w-full h-16 p-4 pt-16 bg-linear-to-b from-gray-50 to-gray-50/0">
                <Tabs value={visibleDevTab} onValueChange={value => visibleDevTab = value as "document_tree" | "sync_queue"}>
                    <TabsList>
                        <TabsTrigger value="document_tree">Dokumentenbaum</TabsTrigger>
                        <TabsTrigger value="sync_queue">Sync-Warteschlange</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>
        </div>
    {/if}
</div>