import { pubsub } from '$lib/server/events';
import type { RequestEvent } from '@sveltejs/kit';

export function GET({ locals }: RequestEvent) {
    if (!locals.session || !locals.user) {
        return new Response('Unauthorized', { status: 401 });
    }

    const stream = new ReadableStream({
        start(controller) {
            let listener: any = null;
            let interval: any = null;

            listener = (data: any) => {
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
            };
            
            pubsub.on('sidebar_title_update', listener);

            // Dummy keep-alive payload to prevent connection timeouts
            interval = setInterval(() => {
                controller.enqueue(`: ping\n\n`);
            }, 30000);
            
            // Cleanup state attached to locals
            (locals as any).cleanupTitleSync = () => {
                pubsub.off('sidebar_title_update', listener);
                clearInterval(interval);
            };
        },
        cancel() {
            if ((locals as any).cleanupTitleSync) (locals as any).cleanupTitleSync();
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
