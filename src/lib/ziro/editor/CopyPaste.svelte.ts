import {type Block} from "$lib/ziro/Block";
import {type NonCollapsedSelection, Page, type SelectionPosition} from "$lib/ziro/Page.svelte";
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

            const isStartBlock = block.id === selection.start.blockId;
            const isEndBlock = block.id === selection.end.blockId;

            if (selection.isBlockSelection) {
                // For block selection, copy the entire block as is
                // We still want to create a new instance to avoid modifying the original
                if (block instanceof TextBlock) {
                    const newBlock = new TextBlock(block.id);
                    newBlock.sortKey = block.sortKey;
                    newBlock.indentLevel = block.indentLevel;
                    newBlock.listType = block.listType;
                    newBlock.listStyle = block.listStyle;
                    newBlock.variant = block.variant;
                    newBlock.inlines = [...block.inlines];
                    blocksToCopy.push(newBlock);
                } else {
                    blocksToCopy.push(block);
                }
            } else if (isStartBlock && isEndBlock && block instanceof TextBlock) {
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
                newBlock.variant = block.variant;

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
            } else if (isEndBlock && block instanceof TextBlock) {
                // Need to split
                const offset = selection.end.offset;
                const end = block.findInlineAtOffset(offset);
                const indexOfEnd = block.inlines.indexOf(end.inline);
                const newBlock = new TextBlock(block.id);
                newBlock.sortKey = block.sortKey;
                newBlock.indentLevel = block.indentLevel;
                newBlock.listType = block.listType;
                newBlock.listStyle = block.listStyle;
                newBlock.variant = block.variant;
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
            } else if (isStartBlock && block instanceof TextBlock) {
                // Need to split
                const offset = selection.start.offset;
                const start = block.findInlineAtOffset(offset);
                const indexOfStart = block.inlines.indexOf(start.inline);
                const newBlock = new TextBlock(block.id);
                newBlock.sortKey = block.sortKey;
                newBlock.indentLevel = block.indentLevel;
                newBlock.listType = block.listType;
                newBlock.listStyle = block.listStyle;
                newBlock.variant = block.variant;

                if (start.inline instanceof InlineText) {
                    const splitInline = new InlineText(start.inline.id);
                    splitInline.content = start.inline.content.slice(start.offsetInInline);
                    splitInline.copyStylesFrom(start.inline);
                    newBlock.inlines.push(splitInline);
                } else {
                    newBlock.inlines.push(start.inline);
                }

                for (let i = indexOfStart + 1; i < block.inlines.length; i++) {
                    newBlock.inlines.push(block.inlines[i]);
                }
                blocksToCopy.push(newBlock);
            } else {
                blocksToCopy.push(block);
            }

            if (block.id === selection.end.blockId) break;
        }
        let blocks = blocksToCopy.map(b => b.toObject());
        const text = Converter.blocksToText(blocksToCopy, inPage);
        const html = Converter.blocksToHtml(blocksToCopy, inPage, selection.isBlockSelection);

        console.log("copied blocks", blocks, text, html);

        const clipboardItem = new ClipboardItem({
            "text/html": new Blob([html], {type: "text/html"}),
            "text/plain": new Blob([text], {type: "text/plain"}),
        })

        await navigator.clipboard.write([clipboardItem]);

        this.clipboard = blocks;
    }

    async paste(inPage: Page) {
        const clipboardItems = await navigator.clipboard.read();
        for (const item of clipboardItems) {
            if (item.types.includes("text/html")) {
                const blob = await item.getType("text/html");
                const html = await blob.text();

                const blocksMatch = html.match(/<!-- Ziro-Application-Clipboard-Blocks=(.*?) -->/);
                const isBlockSelectionMatch = html.match(/<!-- Ziro-Application-Clipboard-IsBlockSelection=(.*?) -->/);

                if (blocksMatch) {
                    const blockObjects = JSON.parse(atob(blocksMatch[1]));
                    const isBlockSelection = isBlockSelectionMatch ? isBlockSelectionMatch[1] === "true" : false;

                    const newBlocks = blockObjects.map((obj: any) => this.rehydrateBlock(obj, inPage));

                    if (inPage.selection) {
                        const normalized = inPage.getNormalizedSelection();
                        if (normalized) {
                            inPage.deleteContent(normalized.start, normalized.end);
                        }

                        const selection = inPage.selection!;
                        if (isBlockSelection) {
                            this.pasteAsBlocks(newBlocks, selection.start, inPage);
                        } else {
                            this.pasteIntoBlock(newBlocks, selection.start, inPage);
                        }
                    }
                    return;
                } else {
                    console.log("Pasted HTML without Ziro comment:", html);
                }
            } else if (item.types.includes("text/plain")) {
                const blob = await item.getType("text/plain");
                const text = await blob.text();
                console.log("Pasted plain text (no Ziro comment):", text);
            }
        }
    }

    private rehydrateBlock(obj: any, inPage: Page): Block {
        const block = inPage.factory.createTextBlock();
        block.variant = obj.variant;
        block.indentLevel = obj.indentLevel;
        block.listType = obj.listType;
        block.listStyle = obj.listStyle;
        block.inlines = obj.inlines.map((iObj: any) => {
            if (iObj.type === "text") {
                const inline = inPage.factory.createInlineText();
                inline.content = iObj.content;
                inline.bold = iObj.bold;
                inline.italic = iObj.italic;
                inline.underline = iObj.underline;
                inline.strikethrough = iObj.strikethrough;
                inline.code = iObj.code;
                return inline;
            } else {
                return inPage.factory.createInlineSymbol({
                    type: iObj.symbolType,
                    emoji: iObj.emoji
                });
            }
        });
        return block;
    }

    private pasteAsBlocks(newBlocks: Block[], at: SelectionPosition, inPage: Page) {
        let lastId = at.blockId;
        for (const block of newBlocks) {
            inPage.insertBlock(block, { type: "after_block", afterId: lastId });
            lastId = block.id;
        }
        // Select the newly pasted blocks
        inPage.setSelection(
            { blockId: newBlocks[0].id, offset: 0 },
            { blockId: newBlocks[newBlocks.length - 1].id, offset: newBlocks[newBlocks.length - 1].toDisplayText().length },
            true
        );
    }

    private pasteIntoBlock(newBlocks: Block[], at: SelectionPosition, inPage: Page) {
        if (newBlocks.length === 0) return;

        const targetBlock = inPage.blocks.find(b => b.id === at.blockId);
        if (!(targetBlock instanceof TextBlock)) {
            this.pasteAsBlocks(newBlocks, at, inPage);
            return;
        }

        // 1. Split the current block at cursor
        const { newBlockId } = inPage.splitBlock(at.blockId, at.offset);
        const nextBlock = inPage.blocks.find(b => b.id === newBlockId) as TextBlock;

        // 2. Merge first pasted block's inlines into the first half
        const firstPasted = newBlocks[0] as TextBlock;
        targetBlock.inlines = [...targetBlock.inlines, ...firstPasted.inlines];
        targetBlock._mergeAdjacentBaseInlines();

        // 3. Insert intermediate blocks
        let lastId = targetBlock.id;
        for (let i = 1; i < newBlocks.length - 1; i++) {
            inPage.insertBlock(newBlocks[i], { type: "after_block", afterId: lastId });
            lastId = newBlocks[i].id;
        }

        // 4. Merge last pasted block's inlines into the second half (the one we split off)
        const lastPasted = newBlocks.length > 1 ? newBlocks[newBlocks.length - 1] as TextBlock : firstPasted;
        if (newBlocks.length > 1) {
            // If more than one block was pasted, we need to insert the last one's content 
            // before the content that was originally after the cursor.
            // We'll actually insert the last pasted block as a new block, then merge the 'nextBlock' into it.
            inPage.insertBlock(lastPasted, { type: "after_block", afterId: lastId });
            const lastPastedId = lastPasted.id;
            inPage.mergeBlocks(lastPastedId, nextBlock.id);
            
            // Set selection at the end of the pasted content
            const endOffset = lastPasted.toDisplayText().length - (nextBlock.toDisplayText().length);
            inPage.setSelection({ blockId: lastPastedId, offset: endOffset }, null);
        } else {
            // Only one block pasted, it was already merged into targetBlock. 
            // Now merge nextBlock back into targetBlock to restore the remainder.
            const mergeOffset = targetBlock.getContentLength();
            inPage.mergeBlocks(targetBlock.id, nextBlock.id);
            inPage.setSelection({ blockId: targetBlock.id, offset: mergeOffset }, null);
        }
    }
}

export const copyPaste = new CopyPaste();
