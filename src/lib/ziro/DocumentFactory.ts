import type { BasePage } from "./BasePage";
import type { BaseTextBlock, BaseInlineText, BaseInlineSymbol, BaseInlineSymbolVariant } from "./BaseTextBlock";

export interface DocumentFactory {
    createPage(): BasePage;
    createTextBlock(id?: string): BaseTextBlock;
    createInlineText(id?: string): BaseInlineText;
    createInlineSymbol(symbol: BaseInlineSymbolVariant, id?: string): BaseInlineSymbol;
}
