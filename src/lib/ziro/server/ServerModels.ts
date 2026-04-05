import { BasePage } from "../BasePage";
import { BaseTextBlock, BaseInlineText, BaseInlineSymbol, type BaseInlineSymbolVariant, type BaseTextBlockVariant, type ListStyle } from "../BaseTextBlock";
import type { Block } from "../Block";
import type { DocumentFactory } from "../DocumentFactory";
import type { PageEvent } from "../Events";
import type { Selection } from "../BasePage";

export class ServerPage extends BasePage {
    blocks: Block[] = [];
    selection: null | Selection = null;
    cursorXPosition: number | null = null;
    eventQueue: PageEvent[] = [];
    factory: DocumentFactory;

    constructor(factory: DocumentFactory) {
        super();
        this.factory = factory;
    }
}

export class ServerBaseTextBlock extends BaseTextBlock {
    id: string;
    sortKey: string = "";
    inlines: any[] = [];
    variant: BaseTextBlockVariant = "paragraph";
    indentLevel: number = 0;
    listType: "unordered" | "ordered" | null = null;
    listStyle: ListStyle | null = null;

    constructor(id: string) {
        super();
        this.id = id;
    }
}

export class ServerBaseInlineText extends BaseInlineText {
    id: string;
    sortKey: string = "";
    content: string = "";
    bold: boolean = false;
    italic: boolean = false;
    underline: boolean = false;
    strikethrough: boolean = false;
    code: boolean = false;

    constructor(id: string) {
        super();
        this.id = id;
    }
}

export class ServerBaseInlineSymbol extends BaseInlineSymbol {
    id: string;
    sortKey: string = "";
    symbol: BaseInlineSymbolVariant;

    constructor(id: string, symbol: BaseInlineSymbolVariant) {
        super();
        this.id = id;
        this.symbol = symbol;
    }
}

export class ServerFactory implements DocumentFactory {
    createPage(): BasePage {
        return new ServerPage(this);
    }
    createTextBlock(id?: string): BaseTextBlock {
        return new ServerBaseTextBlock(id || crypto.randomUUID());
    }
    createInlineText(id?: string): BaseInlineText {
        return new ServerBaseInlineText(id || crypto.randomUUID());
    }
    createInlineSymbol(symbol: BaseInlineSymbolVariant, id?: string): BaseInlineSymbol {
        return new ServerBaseInlineSymbol(id || crypto.randomUUID(), symbol);
    }
}
