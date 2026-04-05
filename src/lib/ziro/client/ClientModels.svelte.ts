import { BasePage } from "../BasePage";
import { BaseTextBlock, BaseInlineText, BaseInlineSymbol, type BaseInlineSymbolVariant, type BaseTextBlockVariant, type ListStyle } from "../BaseTextBlock";
import type { Block } from "../Block";
import { DocumentFactory } from "../DocumentFactory";
import type { PageEvent } from "../Events";
import type { Selection } from "../BasePage";
import { v4 as uuidv4 } from 'uuid';

export class ClientPage extends BasePage {
    blocks: Block[] = $state([]);
    selection: null | Selection = $state(null);
    cursorXPosition: number | null = $state(null);
    eventQueue: PageEvent[] = $state([]);
    factory: DocumentFactory;

    constructor(factory: DocumentFactory) {
        super();
        this.factory = factory;
    }
}

export class ClientBaseTextBlock extends BaseTextBlock {
    id: string;
    sortKey: string = $state("");
    inlines: any[] = $state([]);
    variant: BaseTextBlockVariant = $state("paragraph");
    indentLevel: number = $state(0);
    listType: "unordered" | "ordered" | null = $state(null);
    listStyle: ListStyle | null = $state(null);

    constructor(id: string) {
        super();
        this.id = id;
    }
}

export class ClientBaseInlineText extends BaseInlineText {
    id: string;
    sortKey: string = $state("");
    content: string = $state("");
    bold: boolean = $state(false);
    italic: boolean = $state(false);
    underline: boolean = $state(false);
    strikethrough: boolean = $state(false);
    code: boolean = $state(false);

    constructor(id: string) {
        super();
        this.id = id;
    }
}

export class ClientBaseInlineSymbol extends BaseInlineSymbol {
    id: string;
    sortKey: string = $state("");
    symbol: BaseInlineSymbolVariant = $state({type: "x"});

    constructor(id: string, symbol: BaseInlineSymbolVariant) {
        super();
        this.id = id;
        this.symbol = symbol;
    }
}

export class ClientFactory extends DocumentFactory {
    createPage(): BasePage {
        return new ClientPage(this);
    }
    createTextBlock(id?: string): BaseTextBlock {
        return new ClientBaseTextBlock(id || uuidv4());
    }
    createInlineText(id?: string): BaseInlineText {
        return new ClientBaseInlineText(id || uuidv4());
    }
    createInlineSymbol(symbol: BaseInlineSymbolVariant, id?: string): BaseInlineSymbol {
        return new ClientBaseInlineSymbol(id || uuidv4(), symbol);
    }
}

