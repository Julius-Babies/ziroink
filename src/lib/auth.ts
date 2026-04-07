import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";
import { db } from "$lib/server/db";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "sqlite",
    }),
    trustedOrigins: ["https://ziroink.werkbank.space"],
    emailAndPassword: {
        enabled: true,
    },
    plugins: [sveltekitCookies(getRequestEvent)]
});