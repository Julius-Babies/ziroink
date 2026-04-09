import type {BaseInline, ListStyle, TextBlockVariant} from "$lib/ziro/TextBlock.svelte";

export type BlockInsertPosition =
    | { type: "after_block"; afterId: string }
    | { type: "end" };

export type StyleType = "bold" | "italic" | "underline" | "strikethrough" | "code";

export type PageEvent =
    | { type: "block_inserted"; blockId: string; position: BlockInsertPosition; blockData: any }
    | { type: "block_deleted"; blockId: string; blockData: any; position: BlockInsertPosition }
    | { type: "block_indent_changed"; blockId: string; oldIndent: number; newIndent: number }
    | { type: "block_list_changed"; blockId: string; oldListType: "unordered" | "ordered" | null; newListType: "unordered" | "ordered" | null; oldListStyle: ListStyle | null; newListStyle: ListStyle | null }
    | { type: "block_variant_changed"; blockId: string; oldVariant: TextBlockVariant; newVariant: TextBlockVariant }
    | { type: "block_split"; oldBlockId: string; newBlockId: string; splitOffset: number; oldBlockData: any; newBlockData: any }
    | { type: "block_merged"; targetBlockId: string; sourceBlockId: string; oldTargetData: any; oldSourceData: any }
    | { type: "text_inserted"; blockId: string; offset: number; text: string }
    | { type: "text_deleted"; blockId: string; startOffset: number; endOffset: number; deletedText: string }
    | { type: "style_toggled"; blockId: string; startOffset: number; endOffset: number; style: StyleType; value: boolean }
    | { type: "inline_inserted"; blockId: string; inline: BaseInline; offset: number }
    | { type: "inlines_replaced"; blockId: string; oldInlines: { id: string }[]; newInlines: { id: string }[] }
    | { type: "blocks_replaced"; oldBlockIds: string[]; newBlockIds: string[] }
    | { type: "selection_changed"; start: { blockId: string; offset: number }; end: { blockId: string; offset: number } | null }
    | { type: "blocks_set"; blockIds: string[] };
