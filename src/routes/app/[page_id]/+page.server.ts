import { error } from "@sveltejs/kit";
import { db } from "$lib/server/db";
import { block as blockTable, page as pageTable } from "$lib/server/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "$lib/auth";
import findUuidAtEnd from "$lib/util/findUuidAtEnd";

export const load = async ({ params, request }) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });
    
    if (!session || !session.user) {
        throw error(401, "Unauthorized");
    }

    const pageId = findUuidAtEnd(params.page_id);

    const targetPage = await db.query.page.findFirst({
        where: eq(pageTable.id, pageId)
    });

    if (!targetPage) {
        throw error(404, "Page not found");
    }

    const blocks = await db.query.block.findMany({
        where: eq(blockTable.pageId, pageId),
        orderBy: (blockTable, { asc }) => [asc(blockTable.sortKey)]
    });

    return {
        page: targetPage,
        blocks: blocks
    };
};
