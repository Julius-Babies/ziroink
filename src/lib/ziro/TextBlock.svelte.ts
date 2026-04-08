import {generateKeyBetween} from 'fractional-indexing';
import type {Block} from "$lib/ziro/Block";
import {toRoman} from "$lib/ziro/ui/roman";
import * as path from "node:path";
import type {Page} from "$lib/ziro/Page.svelte";

export type TextBlockVariant = "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type ListStyle = { type: "bullet" } |
    { type: "dash" } |
    { type: "arrow" } |
    { type: "checkbox", checked: boolean } |
    { type: "ordered", prefix: "(" | "", suffix: "." | "" | ")", variant: "letter_uppercase" | "letter_lowercase" | "roman_uppercase" | "roman_lowercase" | "number" }

export class TextBlock implements Block {
    id: string;
    sortKey: string = $state("");
    inlines: BaseInline[] = $state([]);
    variant: TextBlockVariant = $state("paragraph");
    indentLevel: number = $state(0);
    listType: "unordered" | "ordered" | null = $state(null);
    listStyle: ListStyle | null = $state(null);

    constructor(id: string) {
        this.id = id;
    }

    toObject() {
        return {
            id: this.id,
            inlines: this.inlines.map(inline => inline.toObject()),
            type: "text",
            variant: this.variant,
            indentLevel: this.indentLevel,
            listType: this.listType,
            listStyle: this.listStyle,
            sortKey: this.sortKey,
        }
    }

    findInlineAtOffset(offset: number): { inline: BaseInline, offsetInInline: number } {
        if (this.inlines.length === 0) {
            throw new Error(`Failed to findInlineAtOffset: Block ${this.id} has no inlines.`);
        }

        let remaining = offset;
        for (let i = 0; i < this.inlines.length; i++) {
            const inline = this.inlines[i];
            const inlineContentLength = inline instanceof InlineText ? inline.content.length : 1;

            // If we have remaining offset left in this inline, we belong here.
            // If we are at the EXACT end of this inline (remaining === inlineContentLength):
            // 1. If it's the LAST inline, we must return this.
            // 2. If it's a TEXT inline, we prefer to stay at the end of it for a more stable caret
            //    rather than jumping to offset 0 of the next inline (which might be a symbol).
            if (remaining < inlineContentLength || (remaining === inlineContentLength && (i === this.inlines.length - 1 || inline instanceof InlineText))) {
                return {inline, offsetInInline: remaining};
            }

            remaining -= inlineContentLength;
        }

        const lastInline = this.inlines[this.inlines.length - 1];
        const lastLength = lastInline instanceof InlineText ? lastInline.content.length : 1;
        return {inline: lastInline, offsetInInline: lastLength};
    }

    findOffsetByInline(inlineId: string): number {
        let result = 0;
        for (const inline of this.inlines) {
            const inlineContentLength = inline instanceof InlineText ? inline.content.length : 1;
            if (inline.id !== inlineId) {
                result += inlineContentLength;
                continue;
            }

            return result;
        }

        return result;
    }

    getContentLength(): number {
        return this.inlines.reduce((acc, inline) => {
            const inlineContentLength = inline instanceof InlineText ? inline.content.length : 1;
            return acc + inlineContentLength;
        }, 0);
    }

    getVisualText(): string {
        return this.inlines.reduce((acc, inline) => {
            if (inline instanceof InlineText) {
                return acc + inline.content
            } else return acc + "|"
        }, "")
    }

    getAsciiText(): string {
        return this.inlines.reduce((acc, inline) => {
            if (inline instanceof InlineText) {
                return acc + inline.content;
            }

            return acc;
        }, "");
    }

    /**
     * Returns a string that represents the content of this TextBlock. Not to be confused with [getVisualText] which
     * returns a string to determine caret positions, this one tries to create the best string variant of the inlines.
     */
    toDisplayText(): string {
        return this.inlines.map(inline => inline.toDisplayText()).join("")
    }

    _mergeAdjacentBaseInlines() {
        const merged: BaseInline[] = [];
        for (const inline of this.inlines) {
            const last = merged.length > 0 ? merged[merged.length - 1] : null;
            if (last instanceof InlineText && inline instanceof InlineText && last.isSameStyleAs(inline)) {
                last.content += inline.content;
            } else {
                merged.push(inline);
            }
        }
        
        let currentKey = null;
        for (const inl of merged) {
            inl.sortKey = generateKeyBetween(currentKey, null);
            currentKey = inl.sortKey;
        }

        this.inlines = merged;
    }

    getOrderedListItemIndex(inPage: Page): number {
        const currentIndex = inPage.blocks.findIndex(b => b.id === this.id);
        let count = 0;
        for (let i = currentIndex; i >= 0; i--) {
            const b = inPage.blocks[i];
            if (b instanceof TextBlock) {
                if (b.indentLevel < this.indentLevel) {
                    break;
                }
                if (b.indentLevel === this.indentLevel && b.listType === "ordered") {
                    count++;
                }
            }
        }
        return count;
    }

    getOrderedMarker(inPage: Page): string {
        if (!this.listStyle || this.listStyle.type !== "ordered") return "";
        const style = this.listStyle;
        const index = this.getOrderedListItemIndex(inPage);

        let value: string;
        switch (style.variant) {
            case "number":
                value = String(index);
                break;
            case "letter_uppercase":
                value = String.fromCharCode(64 + ((index - 1) % 26) + 1);
                break;
            case "letter_lowercase":
                value = String.fromCharCode(96 + ((index - 1) % 26) + 1);
                break;
            case "roman_uppercase":
                value = toRoman(index);
                break;
            case "roman_lowercase":
                value = toRoman(index).toLowerCase();
                break;
            default:
                value = String(index);
        }

        return (style.prefix || "") + value + (style.suffix || "");
    }
}

export abstract class BaseInline {
    abstract sortKey: string;

    abstract id: string;

    abstract toObject(): any

    abstract toDisplayText(): string
}

export type InlineSymbolVariant = {type: "check"} | {type: "x"} | {type: "question_mark"} | {type: "emoji", emoji: string}

export class InlineSymbol extends BaseInline {
    id: string;
    sortKey: string = $state("");
    symbol: InlineSymbolVariant = $state({type: "x"});

    constructor(id: string, symbol: InlineSymbolVariant) {
        super();
        this.id = id;
        this.symbol = symbol;
    }

    toObject() {
        return {
            id: this.id,
            symbolType: this.symbol.type,
            emoji: this.symbol.type === "emoji" ? this.symbol.emoji : undefined,
            sortKey: this.sortKey,
        }
    }

    toDisplayText(): string {
        if (this.symbol.type === "check") return "✓";
        if (this.symbol.type === "x") return "✗";
        if (this.symbol.type === "question_mark") return "?";
        if (this.symbol.type === "emoji") return this.symbol.emoji;
        return "";
    }
}

export class InlineText extends BaseInline {
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

    copyStylesFrom(from: InlineText) {
        this.bold = from.bold;
        this.italic = from.italic;
        this.underline = from.underline;
        this.strikethrough = from.strikethrough;
        this.code = from.code;
    }

    toObject() {
        return {
            id: this.id,
            type: "text",
            content: this.content,
            bold: this.bold,
            italic: this.italic,
            underline: this.underline,
            strikethrough: this.strikethrough,
            code: this.code,
            sortKey: this.sortKey,
        }
    }

    /**
     * Checks if this inline has the same style as another inline. This is used to determine if two inlines can be merged together.
     * @param other
     */
    isSameStyleAs(other: InlineText): boolean {
        return this.bold === other.bold &&
            this.italic === other.italic &&
            this.underline === other.underline &&
            this.strikethrough === other.strikethrough &&
            this.code === other.code;
    }

    toDisplayText(): string {
        return this.content;
    }
}