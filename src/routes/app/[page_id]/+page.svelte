<script lang="ts">
    import {showPageDeveloperDetails} from "../state";
    import {Tabs, TabsList, TabsTrigger} from "$lib/components/ui/tabs";
    import {JsonView} from "@zerodevx/svelte-json-view";
    import { fly } from "svelte/transition";

    let visibleDevTab: "document_tree" | "sync_queue" = $state("document_tree")
</script>

<div class="w-full h-full flex flex-row bg-white overflow-x-clip">

    <div
            class="h-full flex-1 flex flex-col overflow-y-auto px-12 py-8 pt-16"
    >
        das ist content
    </div>
    {#if $showPageDeveloperDetails}
        <div
                transition:fly={{x: 500}}
                class="h-full flex relative flex-1 bg-gray-50 border-l border-gray-200"
        >
            <div class="absolute top-0 left-0 flex flex-col w-full h-full p-4 overflow-y-auto pt-28">
                {#if visibleDevTab === "document_tree"}
                    <JsonView json={{
                test: "Hallo"
            }}/>
                {:else if visibleDevTab === "sync_queue"}
                    <JsonView json={{events: []}}/>
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