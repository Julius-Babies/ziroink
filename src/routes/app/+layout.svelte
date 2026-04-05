<script lang="ts">
    import {authClient} from "$lib/client";
    import {onMount} from "svelte";
    import {goto} from "$app/navigation";
    import Sidebar from "./Sidebar.svelte";
    import {Code} from "@lucide/svelte";
    import {Button} from "$lib/components/ui/button";
    import {showPageDeveloperDetails} from "./state";
    import { page } from "$app/state";

    let { children } = $props();

    onMount(() => {
        authClient.getSession().then(data => {
            if (!data.data) goto("/login")
        })
    })

    let sidebarWidth = $state(300);
</script>

<div class="flex w-full h-screen relative">
    <div class="flex-1 h-full overflow-y-auto absolute w-full top-0" style="padding-left: {sidebarWidth}px">
        {#key page.url.pathname}
            {@render children()}
        {/key}
    </div>

    <div class="absolute top-0 h-12 w-full flex flex-row gap-2 items-center px-2 bg-linear-to-b from-white to-white/0 pointer-events-none" style="padding-left: {sidebarWidth}px">
        <div class="grow"></div>
        <Button
                variant={$showPageDeveloperDetails ? "default" : "outline"}
                size="icon"
                onclick={() => $showPageDeveloperDetails = !$showPageDeveloperDetails}
        ><Code /></Button>
        <Button
                variant="outline"
                size="default"
                onclick={() => authClient.signOut().then(() => goto("/"))}
        >Abmelden</Button>
    </div>

    <Sidebar
            bind:sidebarWidth={sidebarWidth}
    />
</div>
