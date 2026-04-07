import {pubsub} from '$lib/server/events';
import type {RequestEvent} from '@sveltejs/kit';
import {
    NEW_PAGE_EVENT_KEY,
    PAGE_DELETED_EVENT_KEY, PAGE_METADATA_CHANGED_EVENT_KEY,
    type ServerNewPageEvent,
    type ServerPageDeleteEvent,
    type ServerPageMetadataChangedEvent
} from "$lib/server/sync/events";
import type {
    InitialPagesEventWithType,
    NewPageEventWithType,
    PageDeletedEventWithType,
    PageMetadataChangedEventWithType
} from "$lib/web/app-shell/sidebar/model/events";
import {getAllPages} from "$lib/web/app-shell/sidebar/server/subscribe.server";

export function GET({locals}: RequestEvent) {
    if (!locals.session || !locals.user) {
        return new Response('Unauthorized', {status: 401});
    }

    const userId = locals.user.id;

    const stream = new ReadableStream({
        start(controller) {
            getAllPages(userId).then(pages => {
                const message: InitialPagesEventWithType = {
                    pages: pages,
                    type: "initial_pages",
                };
                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            })

            let newPageListener = (event: ServerNewPageEvent) => {
                if (!event.affected_user_ids.includes(userId)) return;

                const message: NewPageEventWithType = {
                    type: "new_page",
                    page_id: event.page_id,
                    created_at: event.created_at,
                    owner_id: event.created_by,
                    page_title: event.page_title,
                    parent_page_id: event.parent_page_id,
                }

                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            }

            let pageMetadataChangedListener = (event: ServerPageMetadataChangedEvent) => {
                if (!event.flat_title) return;
                if (!event.affected_user_ids.includes(userId)) return;

                const message: PageMetadataChangedEventWithType = {
                    type: "page_metadata_changed",
                    page_id: event.page_id,
                    new_title: event.flat_title.new_title,
                }

                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            }

            let pageDeletedListener = (event: ServerPageDeleteEvent) => {
                if (!event.affected_user_ids.includes(userId)) return;

                const message: PageDeletedEventWithType = {
                    page_id: event.page_id,
                    type: "page_deleted"
                }

                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            }

            pubsub.on(NEW_PAGE_EVENT_KEY, newPageListener);
            pubsub.on(PAGE_METADATA_CHANGED_EVENT_KEY, pageMetadataChangedListener);
            pubsub.on(PAGE_DELETED_EVENT_KEY, pageDeletedListener);

            // Dummy keep-alive payload to prevent connection timeouts
            const interval = setInterval(() => {
                controller.enqueue(`: ping\n\n`);
            }, 30000);

            // Cleanup state attached to locals
            (locals as any).cleanupSync = () => {
                pubsub.off(NEW_PAGE_EVENT_KEY, newPageListener);
                pubsub.off(PAGE_METADATA_CHANGED_EVENT_KEY, pageMetadataChangedListener);
                pubsub.off(PAGE_DELETED_EVENT_KEY, pageDeletedListener)
                clearInterval(interval);
            };
        },
        cancel() {
            if ((locals as any).cleanupSync) (locals as any).cleanupSync();
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}
