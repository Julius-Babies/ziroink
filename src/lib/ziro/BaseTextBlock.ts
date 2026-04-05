import { generateKeyBetween } from 'fractional-indexing';
import type {Block} from "$lib/ziro/Block";

export type BaseTextBlockVariant = "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type ListStyle = { type: "bullet" } |
    { type: "dash" } |
    { type: "arrow" } |
    { type: "ordered", prefix: "(" | "", suffix: "." | "" | ")", variant: "letter_uppercase" | "letter_lowercase" | "roman_uppercase" | "roman_lowercase" | "number" }

export abstract class BaseTextBlock implements Block {
    abstract sortKey: string;

    abstract id: string;
    abstract inlines: BaseInline[];
    abstract variant: BaseTextBlockVariant;
    abstract indentLevel: number;
    abstract listType: "unordered" | "ordered" | null;
    abstract listStyle: ListStyle | null;

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
            const inlineContentLength = inline instanceof BaseInlineText ? inline.content.length : 1;

            if (remaining <= inlineContentLength) {
                return {inline, offsetInInline: remaining};
            }
            remaining -= inlineContentLength;
        }

        // If we exhausted the loop, the offset was larger than the block content.
        // Cap it to the end of the last inline instead of crashing.
        const lastInline = this.inlines[this.inlines.length - 1];
        const lastLength = lastInline instanceof BaseInlineText ? lastInline.content.length : 1;
        return {inline: lastInline, offsetInInline: lastLength};
    }

    findOffsetByInline(inlineId: string): number {
        let result = 0;
        for (const inline of this.inlines) {
            const inlineContentLength = inline instanceof BaseInlineText ? inline.content.length : 1;
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
            const inlineContentLength = inline instanceof BaseInlineText ? inline.content.length : 1;
            return acc + inlineContentLength;
        }, 0);
    }

    getVisualText(): string {
        return this.inlines.reduce((acc, inline) => {
            if (inline instanceof BaseInlineText) {
                return acc + inline.content
            } else return acc + "|"
        }, "")
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
            if (last instanceof BaseInlineText && inline instanceof BaseInlineText && last.isSameStyleAs(inline)) {
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
}

export abstract class BaseInline {
    abstract sortKey: string;

    abstract id: string;

    abstract toObject(): any

    abstract toDisplayText(): string
}

export abstract class BaseInlineSymbol extends BaseInline {
    abstract id: string;
    abstract sortKey: string;
    abstract symbol: BaseInlineSymbolVariant;

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

export type BaseInlineSymbolVariant = {type: "check"} | {type: "x"} | {type: "question_mark"} | {type: "emoji", emoji: string}

export abstract class BaseInlineText extends BaseInline {
    abstract id: string;
    abstract sortKey: string;
    abstract content: string;
    abstract bold: boolean;
    abstract italic: boolean;
    abstract underline: boolean;
    abstract strikethrough: boolean;
    abstract code: boolean;

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
    isSameStyleAs(other: BaseInlineText): boolean {
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