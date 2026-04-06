import {db} from '$lib/server/db';
import {block, page} from '$lib/server/db/schema';
import {and, eq, isNull} from 'drizzle-orm';
import {redirect} from '@sveltejs/kit';
import type {LayoutServerLoad} from './$types';
import type {ApiPage} from "$lib/ziro/ApiPage";
import {ServerFactory} from "$lib/ziro/server/ServerModels";

export const load: LayoutServerLoad = async ({ locals }) => {
    if (!locals.user) {
        throw redirect(302, '/login');
    }

    const dbPages = await db
        .select()
        .from(page)
        .where(and(eq(page.ownerId, locals.user.id), isNull(page.deletedAt)))
        .orderBy(page.createdAt);

    const factory = new ServerFactory();

    const pages: ApiPage[] = await Promise.all(dbPages.map(async (p) => {
        const firstBlock = await db.query.block.findFirst({
            where: eq(block.pageId, p.id),
            orderBy: (block, { asc }) => [asc(block.sortKey)]
        });
        
        let title = "Unbenannte Seite";
        if (firstBlock) {
            const block = factory.fromObject(firstBlock as any);
            const displayText = block.toDisplayText();
            if (displayText && displayText !== "") {
                title = displayText;
            }
        }
        
        return {
            id: p.id,
            title,
            created_at: p.createdAt
        };
    }));

    return {
        pages
    };
};
