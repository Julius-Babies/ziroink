import type {RequestEvent} from "@sveltejs/kit";
import {json} from "@sveltejs/kit";
import {auth} from "$lib/auth";
import {db} from "$lib/server/db";
import {block as blockTable, page} from "$lib/server/db/schema";
import {eq, inArray} from "drizzle-orm";
import type {PageEvent} from "$lib/ziro/Events";
import {pubsub} from "$lib/server/events";
import {PAGE_METADATA_CHANGED_EVENT_KEY, type ServerPageMetadataChangedEvent} from "$lib/server/sync/events";
import {DocumentFactory} from "$lib/ziro/DocumentFactory.svelte";

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

    const { events, modifiedBlocks, deletedBlockIds: manualDeletedBlockIds, clientId } = await request.json() as { events: PageEvent[], modifiedBlocks: any[], deletedBlockIds?: string[], clientId: string };

    if ((!modifiedBlocks || modifiedBlocks.length === 0) && (!events || events.length === 0)) {
        return json({ success: true, message: "No events or blocks to sync" });
    }

    // Execute bulk upsert (insert or update) for the modified blocks
    if (modifiedBlocks && modifiedBlocks.length > 0) {
        for (const block of modifiedBlocks) {
            await db.insert(blockTable)
                .values({
                    id: block.id,
                    pageId: pageId,
                    type: block.type || "text",
                    variant: block.variant,
                    indentLevel: block.indentLevel || 0,
                    listType: block.listType || null,
                    listStyle: block.listStyle || null,
                    sortKey: block.sortKey || "a0",
                    content: block.inlines || [],
                })
                .onConflictDoUpdate({
                    target: blockTable.id,
                    set: {
                        variant: block.variant,
                        indentLevel: block.indentLevel || 0,
                        listType: block.listType || null,
                        listStyle: block.listStyle || null,
                        sortKey: block.sortKey || "a0",
                        content: block.inlines || [],
                        updatedAt: new Date()
                    }
                });
        }
    }

    const blocksToDelete = new Set<string>(manualDeletedBlockIds || []);
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
        events: events || [],
        modifiedBlocks: modifiedBlocks || [],
        deletedBlockIds: Array.from(blocksToDelete)
    });

    // Check if the title block (first block) was modified and emit a sidebar update
    const titleBlock = modifiedBlocks ? modifiedBlocks.find(b => b.sortKey === "a0") : null;
    if (titleBlock) {
        let title = "Unbenannte Seite";
        const factory = new DocumentFactory();
        const blockObj = factory.fromObject(titleBlock as any);
        const displayText = blockObj.toDisplayText();
        if (displayText && displayText !== "") {
            title = displayText;
        }

        const event: ServerPageMetadataChangedEvent = {
            page_id: pageId,
            affected_user_ids: [targetPage.ownerId],
            flat_title: { new_title: title }
        }

        pubsub.emit(PAGE_METADATA_CHANGED_EVENT_KEY, event);
    }

    return json({ success: true, syncedBlocks: modifiedBlocks ? modifiedBlocks.length : 0, deletedBlocks: blocksToDelete.size });
};
