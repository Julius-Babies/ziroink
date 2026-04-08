<script lang="ts">
    import {Tabs, TabsList, TabsTrigger} from "$lib/components/ui/tabs";

    let {
        visibleDevTab = $bindable(),
    }: {
        visibleDevTab: "document_tree" | "sync_queue" | "copy_paste"
    } = $props();

    function onChange(to: string) {
        visibleDevTab = to as typeof visibleDevTab;
    }
</script>

<Tabs value={visibleDevTab} onValueChange={onChange}>
    <TabsList>
        <TabsTrigger value="document_tree">Dokumentenbaum</TabsTrigger>
        <TabsTrigger value="sync_queue">Sync-Warteschlange</TabsTrigger>
        <TabsTrigger value="copy_paste">Zwischenablage</TabsTrigger>
    </TabsList>
</Tabs>