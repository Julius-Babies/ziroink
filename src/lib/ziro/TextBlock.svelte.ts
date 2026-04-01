import type {Block} from "$lib/ziro/Block";

export class TextBlock implements Block{
    id: string;
    inlines: Inline[] = $state([])

    constructor(id: string) {
        this.id = id;
    }

    toObject() {
        return {
            id: this.id,
            inlines: this.inlines.map(inline => inline.toObject()),
            type: "text",
        }
    }

    findInlineAtOffset(offset: number): { inline: Inline, offsetInInline: number } {
        let remaining = offset;
        for (const inline of this.inlines) {
            const inlineContentLength = inline instanceof InlineText ? inline.content.length : 1;
            if (remaining <= inlineContentLength) return { inline, offsetInInline: remaining };
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

    constructor(id: string) {
        this.id = id;
    }

    toObject() {
        return {
            id: this.id,
            type: "text",
            content: this.content,
        }
    }
}