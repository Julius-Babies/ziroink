<script lang="ts">
    import type {Page} from "$lib/ziro/Page.svelte";

    let {
        content,
        blockId,
        inlineId,
        type,
        page,
        bold = false,
        italic = false,
        underline = false,
        strikethrough = false,
        code = false,
    }: {
        content: string,
        blockId: string;
        inlineId: string | undefined;
        type: "pre-block" | "post-block" | "inline";
        page: Page,
        bold?: boolean,
        italic?: boolean,
        underline?: boolean,
        strikethrough?: boolean,
        code?: boolean,
    } = $props();

    let classes = $derived([
        "inline focus:outline-0 whitespace-pre-wrap",
        bold ? "font-bold" : "",
        italic ? "italic" : "",
        underline && strikethrough ? "underline line-through" : underline ? "underline" : strikethrough ? "line-through" : "",
        code ? "rounded bg-gray-100 px-1 py-0.5 font-mono text-sm text-gray-800" : "",
    ].filter(Boolean).join(" "));
</script>

<span
        class={classes}
        data-ziro-editor-editable
        data-ziro-editor-editable-type={type}
        data-ziro-editor-editable-for-block-id={blockId}
        data-ziro-editor-editable-for-block-inline-id={inlineId}
        contenteditable="true"
>{content + "\u200B"}</span>