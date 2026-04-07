import type { TextBlockVariant, ListStyle } from "./TextBlock.svelte";

export interface InlineObject {
    id: string;
    type?: "text";
    content?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    code?: boolean;
    symbolType?: "check" | "x" | "question_mark" | "emoji";
    emoji?: string;
    sortKey: string;
}

export interface BlockObject {
    id: string;
    type: string;
    variant: TextBlockVariant;
    indentLevel: number;
    listType: "unordered" | "ordered" | null;
    listStyle?: ListStyle;
    sortKey: string;
    inlines?: InlineObject[];
    content?: InlineObject[]; // Alternative field used in some contexts
}
