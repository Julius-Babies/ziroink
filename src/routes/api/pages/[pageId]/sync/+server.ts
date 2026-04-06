import { json } from "@sveltejs/kit";
import { auth } from "$lib/auth";
import { db } from "$lib/server/db";
import { block as blockTable, page } from "$lib/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import type { PageEvent } from "$lib/ziro/Events";
import type { RequestEvent } from "@sveltejs/kit";
import { pubsub } from "$lib/server/events";
import { ServerFactory } from "$lib/ziro/server/ServerModels";

export const POST = async ({ request, params }: RequestEvent) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });
    
    if (!session || !session.user) {
        return json({ error: "Unauthorized" }, { status: 401 });
    }

    const pageId = params.pageId as string;

    const targetPage = await db.query.page.findFirst({
        where: eq(page.id, pageId)
    });

    if (!targetPage || targetPage.ownerId !== session.user.id) {
        return json({ error: "Page not found or unauthorized" }, { status: 404 });
    }

    const { events, modifiedBlocks, clientId } = await request.json() as { events: PageEvent[], modifiedBlocks: any[], clientId: string };

    if (!modifiedBlocks || modifiedBlocks.length === 0) {
        return json({ success: true, message: "No blocks to sync" });
    }

    // Execute bulk upsert (insert or update) for the modified blocks
    for (const block of modifiedBlocks) {
        await db.insert(blockTable)
            .values({
                id: block.id,
                pageId: pageId,
                type: block.type || "text",
                variant: block.variant,
                indentLevel: block.indentLevel || 0,
                listType: block.listType || null,
                listStyleType: block.listStyle?.type || null,
                listStylePrefix: block.listStyle?.prefix || null,
                listStyleSuffix: block.listStyle?.suffix || null,
                listStyleVariant: block.listStyle?.variant || null,
                sortKey: block.sortKey || "a0",
                content: block.inlines || [],
            })
            .onConflictDoUpdate({
                target: blockTable.id,
                set: {
                    variant: block.variant,
                    indentLevel: block.indentLevel || 0,
                    listType: block.listType || null,
                    listStyleType: block.listStyle?.type || null,
                    listStylePrefix: block.listStyle?.prefix || null,
                    listStyleSuffix: block.listStyle?.suffix || null,
                    listStyleVariant: block.listStyle?.variant || null,
                    sortKey: block.sortKey || "a0",
                    content: block.inlines || [],
                    updatedAt: new Date()
                }
            });
    }

    const blocksToDelete = new Set<string>();
    for (const event of events) {
        if (event.type === "block_merged") {
            blocksToDelete.add(event.sourceBlockId);
        } else if (event.type === "block_deleted") {
            blocksToDelete.add(event.blockId);
        }
    }

    if (blocksToDelete.size > 0) {
        await db.delete(blockTable)
            .where(inArray(blockTable.id, Array.from(blocksToDelete)));
    }

    // Broadcast the changes to other clients connected via SSE
    pubsub.emit(`page:${pageId}`, {
        clientId,
        events,
        modifiedBlocks,
        deletedBlockIds: Array.from(blocksToDelete)
    });

    // Check if the title block (first block) was modified and emit a sidebar update
    const titleBlock = modifiedBlocks.find(b => b.sortKey === "a0");
    if (titleBlock) {
        let title = "Untitled";
        const factory = new ServerFactory();
        const blockObj = factory.fromObject(titleBlock as any);
        const displayText = blockObj.toDisplayText();
        if (displayText) {
            title = displayText;
        }
        pubsub.emit(`sidebar_title_update`, {
            pageId,
            title
        });
    }

    return json({ success: true, syncedBlocks: modifiedBlocks.length, deletedBlocks: blocksToDelete.size });
};
