import type { BasePage } from "./BasePage";
import type { BaseTextBlock, BaseInlineText, BaseInlineSymbol, BaseInlineSymbolVariant } from "./BaseTextBlock";
import type { BlockObject, InlineObject } from "./Schema";

export abstract class DocumentFactory {
    abstract createPage(): BasePage;
    abstract createTextBlock(id?: string): BaseTextBlock;
    abstract createInlineText(id?: string): BaseInlineText;
    abstract createInlineSymbol(symbol: BaseInlineSymbolVariant, id?: string): BaseInlineSymbol;

    fromObject(obj: BlockObject): BaseTextBlock {
        const block = this.createTextBlock(obj.id);
        block.variant = obj.variant;
        block.indentLevel = obj.indentLevel;
        block.sortKey = obj.sortKey;

        if (obj.listType) {
            block.listType = obj.listType;
            if (obj.listStyle) {
                block.listStyle = obj.listStyle;
            } else {
                block.listStyle = {
                    type: obj.listStyleType as any,
                    prefix: obj.listStylePrefix,
                    suffix: obj.listStyleSuffix,
                    variant: obj.listStyleVariant
                };
            }
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

