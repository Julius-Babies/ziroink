<script lang="ts">
    import buildTitle from "$lib/components/ui/buildTitle";

    const title = buildTitle("Home")
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>