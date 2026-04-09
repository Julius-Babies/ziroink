<script lang="ts">
    import {Tabs, TabsList, TabsTrigger} from "$lib/components/ui/tabs";

    let {
        visibleDevTab = $bindable(),
    }: {
        visibleDevTab: DevTab,
    } = $props();

    function onChange(to: string) {
        visibleDevTab = to as typeof visibleDevTab;
    }

    export type DevTab = "document_tree" | "sync_queue" | "copy_paste" | "history";
</script>

<Tabs value={visibleDevTab} onValueChange={onChange}>
    <TabsList>
        <TabsTrigger value="document_tree">Dokumentenbaum</TabsTrigger>
        <TabsTrigger value="sync_queue">Sync-Warteschlange</TabsTrigger>
        <TabsTrigger value="copy_paste">Zwischenablage</TabsTrigger>
        <TabsTrigger value="history">Historie</TabsTrigger>
    </TabsList>
</Tabs>