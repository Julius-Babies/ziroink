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
    } = $props();
</script>

<span
        class="inline focus:outline-0"
        style="white-space: pre-wrap; font-weight: {bold ? 'bold' : 'normal'}; font-style: {italic ? 'italic' : 'normal'}; text-decoration: {underline && strikethrough ? 'underline line-through' : underline ? 'underline' : strikethrough ? 'line-through' : 'none'};"
        data-ziro-editor-editable
        data-ziro-editor-editable-type={type}
        data-ziro-editor-editable-for-block-id={blockId}
        data-ziro-editor-editable-for-block-inline-id={inlineId}
        contenteditable="true"
>{content}</span>