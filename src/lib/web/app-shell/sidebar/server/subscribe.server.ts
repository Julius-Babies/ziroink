import {db} from "$lib/server/db";
import {block, page} from "$lib/server/db/schema";
import {and, eq, isNull} from "drizzle-orm";
import type {InitialPage} from "$lib/web/app-shell/sidebar/model/events";
import {DocumentFactory} from "$lib/ziro/DocumentFactory.svelte";

export async function getAllPages(userId: string): Promise<InitialPage[]> {
    const factory = new DocumentFactory();
    return db
        .select()
        .from(page)
        .where(and(eq(page.ownerId, userId), isNull(page.deletedAt)))
        .orderBy(page.createdAt)
        .then((dbPages) => {
            return Promise.all(dbPages.map(async (p) => {
                const firstBlock = await db.query.block.findFirst({
                    where: eq(block.pageId, p.id),
                    orderBy: (block, {asc}) => [asc(block.sortKey)]
                });

                let title = "Unbenannte Seite";
                if (firstBlock) {
                    const block = factory.fromObject(firstBlock as any);
                    const displayText = block.toDisplayText();
                    if (displayText && displayText !== "") {
                        title = displayText;
                    }
                }

                const item: InitialPage = {
                    page_id: p.id,
                    title: title,
                    created_at: p.createdAt.getTime(),
                };

                return item;
            }));
        });
}