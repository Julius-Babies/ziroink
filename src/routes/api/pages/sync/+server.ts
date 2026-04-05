import { pubsub } from '$lib/server/events';
import type { RequestEvent } from '@sveltejs/kit';

export function GET({ locals }: RequestEvent) {
    if (!locals.session || !locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const userId = locals.user.id;

    const stream = new ReadableStream({
        start(controller) {
            let listener: any = null;
            let interval: any = null;

            listener = (newPage: any) => {
                // Only send to the correct owner
                if (newPage.ownerId === userId) {
                    controller.enqueue(`data: ${JSON.stringify(newPage)}\n\n`);
                }
            };
            
            pubsub.on('new_page', listener);

            // Dummy keep-alive payload to prevent connection timeouts
            interval = setInterval(() => {
                controller.enqueue(`: ping\n\n`);
            }, 30000);
            
            // Cleanup state attached to locals
            (locals as any).cleanupSync = () => {
                pubsub.off('new_page', listener);
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