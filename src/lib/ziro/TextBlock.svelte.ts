import type {Block} from "$lib/ziro/Block";

export type TextBlockVariant = "paragraph" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export class TextBlock implements Block{
    id: string;
    inlines: Inline[] = $state([])
    variant: TextBlockVariant = $state("paragraph")
    indentLevel: number = $state(0);

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
        }
    }

    findInlineAtOffset(offset: number): { inline: Inline, offsetInInline: number } {
        let remaining = offset;
        for (let i = 0; i < this.inlines.length; i++) {
            const inline = this.inlines[i];
            const inlineContentLength = inline instanceof InlineText ? inline.content.length : 1;
            
            if (remaining < inlineContentLength) {
                return { inline, offsetInInline: remaining };
            }
            if (remaining === inlineContentLength && i === this.inlines.length - 1) {
                return { inline, offsetInInline: remaining };
            }
            remaining -= inlineContentLength;
        }

        throw new Error("Failed to findInlineAtOffset");
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

        throw new Error("Failed to findOffsetByInline");
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

    mergeAdjacentInlines() {
        const merged: Inline[] = [];
        for (const inline of this.inlines) {
            const last = merged.length > 0 ? merged[merged.length - 1] : null;
            if (last instanceof InlineText && inline instanceof InlineText && last.isSameStyleAs(inline)) {
                last.content += inline.content;
            } else {
                merged.push(inline);
            }
        }
        this.inlines = merged;
    }
}

export abstract class Inline {
    id: string;

    protected constructor(id: string) {
        this.id = id;
    }

    abstract toObject(): any
}

export class InlineText implements Inline {
    id: string;
    content: string = $state("");
    bold: boolean = $state(false);
    italic: boolean = $state(false);
    underline: boolean = $state(false);
    strikethrough: boolean = $state(false);

    constructor(id: string) {
        this.id = id;
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
               this.strikethrough === other.strikethrough;
    }
}