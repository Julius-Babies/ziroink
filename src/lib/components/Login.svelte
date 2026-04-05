<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import { Label } from "$lib/components/ui/label";
    import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "$lib/components/ui/card";
    import { authClient } from "$lib/client";

    let email = $state("");
    let password = $state("");
    let isRegistering = $state(false);
    let error = $state("");
    let loading = $state(false);

    async function handleSubmit(e: Event) {
        e.preventDefault();
        error = "";
        loading = true;

        if (isRegistering) {
            const { data, error: err } = await authClient.signUp.email({
                email,
                password,
                name: email.split("@")[0], // Just use part of email as name for basic auth
            });
            if (err) {
                error = err.message || "An error occurred";
            }
        } else {
            const { data, error: err } = await authClient.signIn.email({
                email,
                password,
            });
            if (err) {
                error = err.message || "An error occurred";
            }
        }
        loading = false;
    }
</script>

<div class="flex items-center justify-center min-h-screen bg-gray-50 p-4">
    <Card class="w-full max-w-sm">
        <form onsubmit={handleSubmit}>
            <CardHeader>
                <CardTitle>{isRegistering ? 'Create an account' : 'Sign in'}</CardTitle>
                <CardDescription>
                    {isRegistering ? 'Enter your email below to create your account' : 'Enter your email below to login to your account'}
                </CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
                {#if error}
                    <div class="text-sm text-red-500 font-medium">{error}</div>
                {/if}
                <div class="space-y-2">
                    <Label for="email">Email</Label>
                    <Input id="email" type="email" placeholder="m@example.com" bind:value={email} required />
                </div>
                <div class="space-y-2">
                    <Label for="password">Password</Label>
                    <Input id="password" type="password" bind:value={password} required />
                </div>
            </CardContent>
            <CardFooter class="flex flex-col gap-4">
                <Button class="w-full" type="submit" disabled={loading}>
                    {#if loading}
                        Loading...
                    {:else}
                        {isRegistering ? 'Sign up' : 'Sign in'}
                    {/if}
                </Button>
                <button 
                    type="button" 
                    class="text-sm text-muted-foreground hover:underline"
                    onclick={() => isRegistering = !isRegistering}
                >
                    {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
            </CardFooter>
        </form>
    </Card>
</div>