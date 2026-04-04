import type {Page} from "$lib/ziro/Page.svelte";
import {InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
import {text} from "@sveltejs/kit";

export class KeyboardHandler {
    page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    onEvent(event: KeyboardEvent) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const blockIdAtCursor = this.page.selection?.start.blockId
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor)
            if (!block) return;

            const newBlock = new TextBlock(crypto.randomUUID())

            if (block instanceof TextBlock) {
                const inlineAtCursor = block.findInlineAtOffset(this.page.selection!.start.offset)
                const index = block.inlines.indexOf(inlineAtCursor.inline);
                if (inlineAtCursor.inline instanceof InlineText) {
                    const textBeforeCursor = inlineAtCursor.inline.content.slice(0, inlineAtCursor.offsetInInline);
                    const textAfterCursor = inlineAtCursor.inline.content.slice(inlineAtCursor.offsetInInline);
                    if (textAfterCursor !== "") {
                        const newInline = new InlineText(crypto.randomUUID());
                        newInline.content = textAfterCursor;
                        inlineAtCursor.inline.content = textBeforeCursor;
                        newBlock.inlines = [...newBlock.inlines, newInline];
                    }

                    newBlock.inlines = [...newBlock.inlines, ...block.inlines.slice(index + 1, block.inlines.length)];
                    block.inlines = block.inlines.slice(0, index + 1);

                    if (newBlock.inlines.length === 0) {
                        newBlock.inlines = [new InlineText(crypto.randomUUID())];
                    }

                    this.page.insertBlock(newBlock, {type: "after_block", afterId: block.id})
                    this.page.setSelection({blockId: newBlock.id, offset: 0}, null)
                    return;
                }
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
        }

        if (event.key === "Backspace") {
            event.preventDefault();
            const blockIdAtCursor = this.page.selection!.start.blockId;
            if (!blockIdAtCursor) return;
            const block = this.page.findBlock(b => b.id === blockIdAtCursor);
            if (!block) return;
            if (block instanceof TextBlock) {
                const textBeforeCursor = block.getVisualText().slice(0, this.page.selection!.start.offset);
                if (/*is Option*/false) {
                    const wordSeparators = [" ", "|", "\n"]
                    console.log("textBeforeCursor", textBeforeCursor)
                    const lastWordSeparatorIndex = Math.max(...wordSeparators.map(s => textBeforeCursor.lastIndexOf(s)))
                    console.log("lastWordSeparatorIndex", lastWordSeparatorIndex)
                    // TODO
                }

                if (textBeforeCursor === "") {
                    console.log("join previous with current block")
                } else {
                    const index = this.page.blocks.indexOf(block);
                    if (index <= 0) return;
                    const previousBlock = this.page.blocks[index];
                    console.log("delete character before cursor")
                }
            } else {
                throw new Error("Non-text blocks are not yet supported")
            }
            console.log("backspace")
        }
    }
}