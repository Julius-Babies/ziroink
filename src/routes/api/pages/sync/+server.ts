import { pubsub } from '$lib/server/events';
import type { RequestEvent } from '@sveltejs/kit';

export function GET({ locals }: RequestEvent) {
    if (!locals.session || !locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;

    const stream = new ReadableStream({
        start(controller) {
            let interval: any = null;

            let newPageListener = (newPage: NewPageEvent) => {
                if (newPage.owner_id !== userId) return;

                const message = { ...newPage, type: "new_page" }

                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            }

            let pageMetadataChangedListener = (event: PageMetadataChangedEvent) => {
                if (event.owner_id !== userId) return;
                
                const message = { ...event, type: "page_metadata_changed" }

                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            }

            let pageDeletedListener = (event: PageDeletedEvent) => {
                if (event.owner_id !== userId) return;

                const message: PageDeletedEventWithType = { ...event, type: "page_deleted" }

                controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
            }

            pubsub.on('new_page', newPageListener);
            pubsub.on('page_metadata_changed', pageMetadataChangedListener);
            pubsub.on('page_deleted', pageDeletedListener);

            // Dummy keep-alive payload to prevent connection timeouts
            interval = setInterval(() => {
                controller.enqueue(`: ping\n\n`);
            }, 30000);
            
            // Cleanup state attached to locals
            (locals as any).cleanupSync = () => {
                pubsub.off('new_page', newPageListener);
                pubsub.off('page_metadata_changed', pageMetadataChangedListener);
                pubsub.off("page_deleted", pageDeletedListener)
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

export interface NewPageEvent {
    page_id: string;
    page_title: string;
    parent_page_id: string | null;
    owner_id: string;
    created_at: number;
}

export type NewPageEventWithType = NewPageEvent & { type: "new_page" }

export interface PageMetadataChangedEvent {
    page_id: string;
    owner_id: string;
    new_title?: string;
}

export type PageMetadataChangedEventWithType = PageMetadataChangedEvent & { type: "page_metadata_changed" }

export interface PageDeletedEvent {
    page_id: string,
    owner_id: string,
}

export type PageDeletedEventWithType = PageDeletedEvent & { type: "page_deleted" }

export type EventWithType = NewPageEventWithType | PageMetadataChangedEventWithType | PageDeletedEventWithType