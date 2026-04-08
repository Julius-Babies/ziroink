import type {Block} from "$lib/ziro/Block";
import {type NonCollapsedSelection, Page} from "$lib/ziro/Page.svelte";
import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
import {Converter} from "$lib/ziro/editor/Converter";

export class CopyPaste {

    clipboard: Block[] | null = $state(null);

    async copy(allBlocks: Block[], selection: NonCollapsedSelection, inPage: Page) {
        let copying = false;
        let blocksToCopy: Block[] = [];
        for (const block of allBlocks) {
            if (block.id !== selection.start.blockId && !copying) continue;
            copying = true;

            if (block.id === selection.start.blockId && block.id === selection.end.blockId && block instanceof TextBlock) {
                // Selection starts and ends in the same block
                const start = block.findInlineAtOffset(selection.start.offset);
                const end = block.findInlineAtOffset(selection.end.offset);
                const indexOfStart = block.inlines.indexOf(start.inline);
                const indexOfEnd = block.inlines.indexOf(end.inline);
                const newBlock = new TextBlock(block.id);
                newBlock.sortKey = block.sortKey;
                newBlock.indentLevel = block.indentLevel;
                newBlock.listType = block.listType;
                newBlock.listStyle = block.listStyle;

                if (start.inline === end.inline) {
                    // Selection is within the same inline
                    if (start.inline instanceof InlineText) {
                        const splitInline = new InlineText(start.inline.id);
                        splitInline.content = start.inline.content.slice(start.offsetInInline, end.offsetInInline);
                        splitInline.copyStylesFrom(start.inline);
                        newBlock.inlines.push(splitInline);
                    } else {
                        newBlock.inlines.push(start.inline);
                    }
                } else {
                    // Selection spans multiple inlines within the same block
                    if (start.inline instanceof InlineText) {
                        const splitInline = new InlineText(start.inline.id);
                        splitInline.content = start.inline.content.slice(start.offsetInInline);
                        splitInline.copyStylesFrom(start.inline);
                        newBlock.inlines.push(splitInline);
                    } else {
                        newBlock.inlines.push(start.inline);
                    }
                    for (let i = indexOfStart + 1; i < indexOfEnd; i++) {
                        newBlock.inlines.push(block.inlines[i]);
                    }
                    if (end.inline instanceof InlineText) {
                        const splitInline = new InlineText(end.inline.id);
                        splitInline.content = end.inline.content.slice(0, end.offsetInInline);
                        splitInline.copyStylesFrom(end.inline);
                        newBlock.inlines.push(splitInline);
                    } else {
                        newBlock.inlines.push(end.inline);
                    }
                }

                blocksToCopy.push(newBlock);
            } else if (block.id === selection.end.blockId && block instanceof TextBlock) {
                // Need to split
                const offset = selection.end.offset;
                const end = block.findInlineAtOffset(offset);
                const indexOfEnd = block.inlines.indexOf(end.inline);
                const newBlock = new TextBlock(block.id);
                newBlock.sortKey = block.sortKey;
                newBlock.indentLevel = block.indentLevel;
                newBlock.listType = block.listType;
                newBlock.listStyle = block.listStyle;
                for (let i = 0; i < indexOfEnd; i++) {
                    newBlock.inlines.push(block.inlines[i]);
                }
                if (end.inline instanceof InlineText) {
                    const splitInline = new InlineText(end.inline.id);
                    splitInline.content = end.inline.content.slice(0, end.offsetInInline);
                    splitInline.copyStylesFrom(end.inline);
                    newBlock.inlines.push(splitInline);
                } else {
                    newBlock.inlines.push(end.inline);
                }
                blocksToCopy.push(newBlock);
            } else {
                blocksToCopy.push(block);
            }

            if (block.id === selection.end.blockId) break;
        }
        let blocks = blocksToCopy.map(b => b.toObject());
        const text = Converter.blocksToText(blocksToCopy, inPage);

        const html = `
            <!-- Ziro-Application-Clipboard-Blocks=${btoa(JSON.stringify(blocks))} -->
            <p>html ${text}</p>
        `

        console.log("copied blocks", blocks, text, html);

        const clipboardItem = new ClipboardItem({
            //"text/html": new Blob([html], {type: "text/html"}),
            "text/plain": new Blob([text], {type: "text/plain"}),
        })

        await navigator.clipboard.write([clipboardItem]);

        this.clipboard = blocks;
    }
}

export const copyPaste = new CopyPaste();