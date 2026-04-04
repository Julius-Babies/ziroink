<script lang="ts">
    import {JsonView} from "@zerodevx/svelte-json-view";
    import {Page} from "$lib/ziro/Page.svelte";
    import {TextBlock, InlineText} from "$lib/ziro/TextBlock.svelte";
    import BottomWhitespace from "$lib/ziro/editor/BottomWhitespace.svelte";
    import BlockRenderer from "$lib/ziro/editor/BlockRenderer.svelte";
    import SelectionManager from "$lib/ziro/editor/SelectionManager.svelte";
    import {KeyboardHandler} from "$lib/ziro/KeyboardHandler";
    import {onMount} from "svelte";

    function createSamplePage() {
        const p = new Page();
        
        function createText(content: string, styles: Partial<InlineText> = {}) {
            const inline = new InlineText(crypto.randomUUID());
            inline.content = content;
            Object.assign(inline, styles);
            return inline;
        }

        function createBlock(variant: any, inlines: InlineText[], options: any = {}) {
            const block = new TextBlock(crypto.randomUUID());
            (block as any).variant = variant;
            block.inlines = inlines.length > 0 ? inlines : [createText("")];
            (block as any).indentLevel = options.indent || 0;
            if (options.listType) {
                (block as any).listType = options.listType;
                (block as any).listStyle = options.listStyle;
                if ((block as any).indentLevel === 0) {
                    (block as any).indentLevel = 1;
                }
            }
            return block;
        }

        p.blocks = [
            createBlock("h1", [createText("Welcome to ZiroInk 📝")]),
            createBlock("paragraph", [createText("This is a custom rich-text editor built from scratch in Svelte 5. It features pixel-perfect cursor navigation, block variants, and smart lists.")]),
            createBlock("h2", [createText("Core Features")]),
            createBlock("paragraph", [createText("Typography & Formatting")], { listType: "unordered", listStyle: "*" }),
            createBlock("paragraph", [
                createText("You can easily make text "),
                createText("bold", { bold: true }),
                createText(", "),
                createText("italic", { italic: true }),
                createText(", "),
                createText("underlined", { underline: true }),
                createText(", or "),
                createText("struck through", { strikethrough: true }),
                createText(" using keyboard shortcuts (CMD+B, I, U, J).")
            ], { indent: 1 }),
            createBlock("paragraph", [createText("Smart Lists & Indentation")], { listType: "unordered", listStyle: "->" }),
            createBlock("paragraph", [createText("Block Variants (H1 - H6)")], { listType: "unordered", listStyle: "-" }),
            createBlock("h2", [createText("How Lists Work")]),
            createBlock("paragraph", [createText("Start an ordered list by typing '1.' or 'a)'")], { listType: "ordered", listStyle: "1." }),
            createBlock("paragraph", [createText("This is a continuation block! It has no list indicator, but because it shares the same indentation level as the list item above it, it visually aligns perfectly with the list text. You can create these by pressing Enter and then Backspace to remove the list marker, or Ctrl+Enter.")], { indent: 1 }),
            createBlock("paragraph", [createText("Nested lists also work beautifully:")], { listType: "ordered", listStyle: "1.", indent: 2 }),
            createBlock("paragraph", [createText("Roman numerals!")], { listType: "ordered", listStyle: "I.", indent: 3 }),
            createBlock("paragraph", [createText("And more roman numerals")], { listType: "ordered", listStyle: "I.", indent: 3 }),
            createBlock("paragraph", [createText("Letters work too")], { listType: "ordered", listStyle: "a)", indent: 2 }),
            createBlock("paragraph", [createText("And it keeps counting")], { listType: "ordered", listStyle: "1.", indent: 1 }),
            createBlock("paragraph", []),
        ];
        
        return p;
    }

    let page = $state(createSamplePage());
    let keyboardHandler: KeyboardHandler | null = $state(null);

    onMount(() => {
        keyboardHandler = new KeyboardHandler(page);
    })
</script>

<svelte:window onkeydowncapture={(e) => keyboardHandler?.onEvent(e)}/>

<div class="w-full h-full flex flex-row">
    <div
            class="h-full flex-1 flex flex-col overflow-y-auto px-12 py-8"
            role="textbox"
            tabindex="-1"
    >
        {#each page.blocks as block (block.id)}
            <BlockRenderer
                    block={block}
                    page={page}
            />
        {/each}
        <BottomWhitespace page={page}/>
    </div>
    <div class="h-full flex-1 overflow-y-auto bg-gray-50 border-l border-gray-200 p-4">
        <JsonView json={{
            cursorX: page.cursorXPosition,
            selection: page.selection,
            blocks: page.blocks.map(b => b.toObject())
        }}/>
    </div>
</div>

<SelectionManager page={page}/>
