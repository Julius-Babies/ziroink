import {json, type RequestEvent} from "@sveltejs/kit";
import {db} from "$lib/server/db";
import {eq} from "drizzle-orm";
import {page} from "$lib/server/db/schema";
import {auth} from "$lib/auth";
import {pubsub} from "$lib/server/events";
import type {PageDeletedEvent} from "../sync/+server";

export async function DELETE({ request, params }: RequestEvent) {
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

    await db.update(page)
        .set({deletedAt: new Date()})
        .where(eq(page.id, pageId));

    const event: PageDeletedEvent = {
        owner_id: targetPage.ownerId,
        page_id: targetPage.id,
    }

    pubsub.emit('page_deleted', event);

    return json({ success: true });
}