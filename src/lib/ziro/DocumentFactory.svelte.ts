import {Page} from "./Page.svelte";
import {InlineSymbol, type InlineSymbolVariant, InlineText, TextBlock} from "./TextBlock.svelte";
import type {BlockObject, InlineObject} from "./Schema";
import {v4 as uuidV4} from "uuid";

export class DocumentFactory {
    createPage(): Page {
        return new Page();
    }
    createTextBlock(id?: string): TextBlock {
        return new TextBlock(id || uuidV4());
    }
    createInlineText(id?: string): InlineText {
        return new InlineText(id || uuidV4());
    }
    createInlineSymbol(symbol: InlineSymbolVariant, id?: string): InlineSymbol {
        return new InlineSymbol(id || uuidV4(), symbol);
    }

    fromObject(obj: BlockObject): TextBlock {
        const block = this.createTextBlock(obj.id);
        block.variant = obj.variant;
        block.indentLevel = obj.indentLevel;
        block.sortKey = obj.sortKey;

        if (obj.listType) {
            block.listType = obj.listType;
            block.listStyle = obj.listStyle || null;
        } else {
            block.listType = null;
            block.listStyle = null;
        }

        const rawInlines = obj.inlines || obj.content || [];
        block.inlines = rawInlines.map(inl => this.inlineFromObject(inl));

        if (block.inlines.length === 0) {
            const empty = this.createInlineText();
            empty.content = "";
            block.inlines = [empty];
        }

        return block;
    }

    private inlineFromObject(obj: InlineObject): any {
        if (obj.symbolType) {
            const sym = this.createInlineSymbol({ type: obj.symbolType, emoji: obj.emoji } as any, obj.id);
            sym.sortKey = obj.sortKey;
            return sym;
        } else {
            const text = this.createInlineText(obj.id);
            text.content = obj.content || "";
            text.bold = !!obj.bold;
            text.italic = !!obj.italic;
            text.underline = !!obj.underline;
            text.strikethrough = !!obj.strikethrough;
            text.code = !!obj.code;
            text.sortKey = obj.sortKey;
            return text;
        }
    }
}

