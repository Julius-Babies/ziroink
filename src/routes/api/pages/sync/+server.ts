import { pubsub } from '$lib/server/events';
import type { RequestEvent } from '@sveltejs/kit';
import {ServerFactory} from "$lib/ziro/server/ServerModels";
import { db } from "$lib/server/db";
import {block, page} from "$lib/server/db/schema";
import {and, eq, isNull} from "drizzle-orm";

export function GET({ locals }: RequestEvent) {
    if (!locals.session || !locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;

    const factory = new ServerFactory();

    const stream = new ReadableStream({
        start(controller) {
            let interval: any = null;

            db
                .select()
                .from(page)
                .where(and(eq(page.ownerId, userId), isNull(page.deletedAt)))
                .orderBy(page.createdAt)
                .then(async (dbPages) => {
                    const pages = await Promise.all(dbPages.map(async (p) => {
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
                            page_id: p.id,
                            title: title,
                            created_at: p.createdAt.getTime(),
                        };
                    }));

                    const message: InitialPagesEventWithType = {
                        pages: pages,
                        type: "initial_pages",
                    };
                    controller.enqueue(`data: ${JSON.stringify(message)}\n\n`);
                });

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

export interface InitialPagesEvent {
    pages: InitialPage[];
}

export interface InitialPage {
    page_id: string;
    title: string;
    created_at: number;
}

export type InitialPagesEventWithType = InitialPagesEvent & { type: "initial_pages" }

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

export type EventWithType = NewPageEventWithType | InitialPagesEventWithType | PageMetadataChangedEventWithType | PageDeletedEventWithType