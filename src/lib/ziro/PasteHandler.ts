import type {Page} from "$lib/ziro/Page.svelte";
import type {TextBlockVariant, ListStyle} from "$lib/ziro/TextBlock.svelte";
import {type BaseInline, TextBlock} from "$lib/ziro/TextBlock.svelte";

function isEmoji(str: string): boolean {
    const emojiRegex = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/u;
    return emojiRegex.test(str);
}

function parseInlineMarkdown(text: string, factory: any): BaseInline[] {
    const inlines: BaseInline[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        const patterns = [
            { regex: /\*\*(.+?)\*\*/, type: "bold" },
            { regex: /__(.+?)__/, type: "underline" },
            { regex: /~~(.+?)~~/, type: "strikethrough" },
            { regex: /`(.+?)`/, type: "code" },
            { regex: /\*(.+?)\*/, type: "italic" },
            { regex: /_(.+?)_/, type: "italic" },
        ];

        let earliestIdx = -1;
        let earliestMatch: { type: string; content: string; prefixLen: number; suffixLen: number; matchStr: string } | null = null;

        for (const pattern of patterns) {
            const m = remaining.match(pattern.regex);
            if (m && m.index !== undefined) {
                if (earliestIdx === -1 || m.index < earliestIdx) {
                    earliestIdx = m.index;
                    earliestMatch = {
                        type: pattern.type,
                        content: m[1],
                        prefixLen: m.index,
                        suffixLen: m[0].length - m.index - m[1].length,
                        matchStr: m[0],
                    };
                }
            }
        }

        if (earliestMatch) {
            if (earliestMatch.prefixLen > 0) {
                const beforeText = remaining.slice(0, earliestMatch.prefixLen);
                inlines.push(...segmentTextToInlines(beforeText, factory));
            }

            const styledInline = factory.createInlineText();
            styledInline.content = earliestMatch.content;
            if (earliestMatch.type === "bold") styledInline.bold = true;
            else if (earliestMatch.type === "italic") styledInline.italic = true;
            else if (earliestMatch.type === "underline") styledInline.underline = true;
            else if (earliestMatch.type === "strikethrough") styledInline.strikethrough = true;
            else if (earliestMatch.type === "code") styledInline.code = true;
            else if (earliestMatch.type === "code") styledInline.code = true;
            inlines.push(styledInline);

            remaining = remaining.slice(earliestMatch.prefixLen + earliestMatch.matchStr.length);
        } else {
            inlines.push(...segmentTextToInlines(remaining, factory));
            remaining = "";
        }
    }

    if (inlines.length === 0) {
        const empty = factory.createInlineText();
        empty.content = "";
        inlines.push(empty);
    }

    return inlines;
}

function segmentTextToInlines(text: string, factory: any): BaseInline[] {
    const inlines: BaseInline[] = [];
    const segments = [...new Intl.Segmenter().segment(text)];

    let currentText = "";
    let currentStyles = { bold: false, italic: false, underline: false, strikethrough: false, code: false };

    for (const segment of segments) {
        if (isEmoji(segment.segment)) {
            if (currentText.length > 0) {
                const inline = factory.createInlineText();
                inline.content = currentText;
                Object.assign(inline, currentStyles);
                inlines.push(inline);
                currentText = "";
            }
            inlines.push(factory.createInlineSymbol({ type: "emoji", emoji: segment.segment }));
        } else {
            currentText += segment.segment;
        }
    }

    if (currentText.length > 0) {
        const inline = factory.createInlineText();
        inline.content = currentText;
        Object.assign(inline, currentStyles);
        inlines.push(inline);
    }

    return inlines;
}

type ParsedLine = {
    text: string;
    variant: TextBlockVariant;
    listType: "unordered" | "ordered" | null;
    listStyle: ListStyle | null;
};

function parseLineToBlockInfo(line: string): ParsedLine {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
        return {
            text: headingMatch[2],
            variant: `h${headingMatch[1].length}` as TextBlockVariant,
            listType: null,
            listStyle: null,
        };
    }

    const bulletMatch = line.match(/^(\*|-|->)\s+(.*)/);
    if (bulletMatch) {
        const trigger = bulletMatch[1];
        let listStyle: ListStyle;
        if (trigger === "*") listStyle = { type: "bullet" };
        else if (trigger === "-") listStyle = { type: "dash" };
        else listStyle = { type: "arrow" };
        return {
            text: bulletMatch[2],
            variant: "paragraph",
            listType: "unordered",
            listStyle,
        };
    }

    const orderedMatch = line.match(/^([0-9]+|a|A|i|I)([.)])\s+(.*)/);
    if (orderedMatch) {
        const trigger = orderedMatch[1];
        const suffix = orderedMatch[2];
        let variant: "number" | "letter_uppercase" | "letter_lowercase" | "roman_uppercase" | "roman_lowercase";
        if (/^[0-9]+$/.test(trigger)) variant = "number";
        else if (trigger === "a") variant = "letter_lowercase";
        else if (trigger === "A") variant = "letter_uppercase";
        else if (trigger === "i") variant = "roman_lowercase";
        else variant = "roman_uppercase";
        return {
            text: orderedMatch[3],
            variant: "paragraph",
            listType: "ordered",
            listStyle: { type: "ordered", prefix: "", suffix: suffix as "." | ")", variant },
        };
    }

    return {
        text: line,
        variant: "paragraph",
        listType: null,
        listStyle: null,
    };
}

export class PasteHandler {
    page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    fromPlaintext(plainText: string): {
        resultingBlocks: TextBlock[];
    } {
        const lines = plainText.split("\n\n");
        const parsedLines = lines.map(parseLineToBlockInfo);

        const hasMultipleBlocks = parsedLines.length > 1;
        const currentBlock = this.page.selection?.start.blockId
            ? this.page.findBlock(b => b.id === this.page.selection!.start.blockId)
            : null;
        const currentIndent = currentBlock instanceof TextBlock ? currentBlock.indentLevel : 0;

        const resultingBlocks: TextBlock[] = [];

        for (const parsed of parsedLines) {
            const block = this.page.factory.createTextBlock();
            block.variant = parsed.variant;
            block.indentLevel = currentIndent;

            if (hasMultipleBlocks) {
                block.listType = parsed.listType;
                block.listStyle = parsed.listStyle;
            }

            block.inlines = parseInlineMarkdown(parsed.text, this.page.factory);
            if (block.inlines.length === 0) {
                const empty = this.page.factory.createInlineText();
                empty.content = "";
                block.inlines = [empty];
            }

            resultingBlocks.push(block);
        }

        return { resultingBlocks };
    }
}
