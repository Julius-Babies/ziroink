import { db } from '$lib/server/db';
import { page } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type {ApiPage} from "$lib/ziro/ApiPage";

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(302, '/login');
    }

    const dbPages = await db
        .select()
        .from(page)
        .where(eq(page.ownerId, locals.user.id))
        .orderBy(page.createdAt);

    const pages: ApiPage[] = dbPages.map(p => ({
        id: p.id,
        created_at: p.createdAt
    }))

    return {
        pages
    };
};
