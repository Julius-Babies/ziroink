import { pubsub } from "$lib/server/events";
import type { RequestEvent } from "@sveltejs/kit";
import { auth } from "$lib/auth";

export const GET = async ({ params, request }: RequestEvent) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });
    
    if (!session || !session.user) {
        return new Response("Unauthorized", { status: 401 });
    }

    const pageId = params.pageId as string;
    
    const stream = new ReadableStream({
        start(controller) {
            const listener = (data: any) => {
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
            };

            const channelName = `page:${pageId}`;
            pubsub.on(channelName, listener);

            // Ping to keep connection alive
            const intervalId = setInterval(() => {
                try {
                    controller.enqueue(": ping\n\n");
                } catch {
                    // Ignore errors if stream is closed
                }
            }, 30000);

            request.signal.addEventListener("abort", () => {
                pubsub.off(channelName, listener);
                clearInterval(intervalId);
                try {
                    controller.close();
                } catch {}
            });
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    });
};