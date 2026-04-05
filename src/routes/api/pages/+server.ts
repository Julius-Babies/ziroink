import { pubsub } from '$lib/server/events';
import { db } from '$lib/server/db';
import { page } from '$lib/server/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { json, type RequestEvent } from '@sveltejs/kit';

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
        id: uuidv4(),
        ownerId: locals.user.id,
        parentId,
        createdAt: new Date(),
    };

    await db.insert(page).values(newPage);
    
    // Broadcast the new page to all listeners
    pubsub.emit('new_page', newPage);

    return json(newPage);
}