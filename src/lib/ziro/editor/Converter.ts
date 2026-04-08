import type {Block} from "$lib/ziro/Block";
import {TextBlock} from "$lib/ziro/TextBlock.svelte";
import type {Page} from "$lib/ziro/Page.svelte";

export class Converter {
    static blocksToText(blocks: Block[], page: Page): string {
        return blocks.map(block => {
            let text = "";
            const indentPrefix = " ".repeat((block.indentLevel - (block instanceof TextBlock ? block.listStyle ? 1 : 0 : 0)) * 2)
            text += indentPrefix;
            let listPrefixLength = 0;
            if (block instanceof TextBlock) {
                if (block.listStyle && block.listStyle.type === "ordered") {
                    let listPrefix = block.getOrderedMarker(page) + " "
                    listPrefixLength = listPrefix.length;
                    text += listPrefix
                } else if (block.listStyle && block.listStyle.type === "checkbox") {
                    let prefix = "[" + (block.listStyle.checked ? "x" : " ") + "] "
                    listPrefixLength = prefix.length;
                    text += prefix
                } else if (block.listStyle && block.listStyle.type === "bullet") {
                    let prefix = "• "
                    listPrefixLength = prefix.length;
                    text += prefix
                } else if (block.listStyle && block.listStyle.type === "dash") {
                    let prefix = "- "
                    listPrefixLength = prefix.length;
                } else if (block.listStyle && block.listStyle.type === "arrow") {
                    let prefix = "→ "
                    listPrefixLength = prefix.length;
                    text += prefix
                }
                const contentIndentation = listPrefixLength + indentPrefix.length;
                const lines = block.toDisplayText().split("\n");
                if (lines.length > 0) text += lines[0]
                if (lines.length > 1) text += lines.slice(1, lines.length).map(line => "\n" + " ".repeat(contentIndentation) + line);
            }

            return text;
        }).join("\n");
    }
}