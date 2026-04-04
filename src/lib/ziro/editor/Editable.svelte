<script lang="ts">
    import type {Page} from "$lib/ziro/Page.svelte";

    let {
        content,
        blockId,
        inlineId,
        type,
        page,
    }: {
        content: string,
        blockId: string;
        inlineId: string | undefined;
        type: "pre-block" | "post-block" | "inline";
        page: Page
    } = $props();
</script>

<div
        class="inline focus:outline-0"
        style="white-space: pre-wrap;"
        data-ziro-editor-editable
        data-ziro-editor-editable-type={type}
        data-ziro-editor-editable-for-block-id={blockId}
        data-ziro-editor-editable-for-block-inline-id={inlineId}
        contenteditable="true"
>
    {content}
</div>