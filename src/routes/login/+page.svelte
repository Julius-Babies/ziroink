<script lang="ts">
    import Login from "$lib/components/Login.svelte";
    import buildTitle from "$lib/components/ui/buildTitle";
    import {onMount} from "svelte";
    import {authClient} from "$lib/client";
    import {goto} from "$app/navigation";

    const title = buildTitle("Login")

    const session = authClient.useSession();
    onMount(() => {
        const unsubscribe = session.subscribe(({ data }) => {
            if (data?.session) {
                // If the user is already logged in, redirect to the home page
                goto("/app")
            }
        });

        return () => {
            unsubscribe();
        }
    })
</script>

<svelte:head>
    <title>{title}</title>
</svelte:head>

<Login />