import {pubsub} from '$lib/server/events';
import {db} from '$lib/server/db';
import {page} from '$lib/server/db/schema';
import {v4 as uuidV4} from 'uuid';
import {json, type RequestEvent} from '@sveltejs/kit';
import {NEW_PAGE_EVENT_KEY, type ServerNewPageEvent} from "$lib/server/sync/events";

export async function POST({ request, locals }: RequestEvent) {
    if (!locals.session || !locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    let parentId = null;
    try {
        const body = await request.json();
        parentId = body.parentId || null;
    } catch (e) {
        // ignore JSON parse error if body is empty
    }

    const newPage = {
        id: uuidV4(),
        ownerId: locals.user.id,
        parentId,
        createdAt: new Date(),
    };

    await db.insert(page).values(newPage);

    const newPageEvent: ServerNewPageEvent = {
        page_id: newPage.id,
        created_by: locals.user.id,
        parent_page_id: parentId,
        page_title: "Unbenannte Seite",
        created_at: newPage.createdAt.getTime(),
        affected_user_ids: [locals.user.id],
    }

    // Broadcast the new page to all listeners
    pubsub.emit(NEW_PAGE_EVENT_KEY, newPageEvent);

    return json(newPage);
}