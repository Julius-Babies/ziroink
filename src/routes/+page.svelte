<script lang="ts">
    import {JsonView} from "@zerodevx/svelte-json-view";
    import {ClientFactory} from "$lib/ziro/client/ClientModels.svelte";
import type {BasePage} from "$lib/ziro/BasePage";
    import {BaseInlineSymbol, type BaseInlineSymbolVariant, BaseInlineText, BaseTextBlock} from "$lib/ziro/BaseTextBlock";
    import BottomWhitespace from "$lib/ziro/editor/BottomWhitespace.svelte";
    import BlockRenderer from "$lib/ziro/editor/BlockRenderer.svelte";
    import SelectionManager from "$lib/ziro/editor/SelectionManager.svelte";
    import {KeyboardHandler} from "$lib/ziro/editor/keyboard/KeyboardHandler";
    import {onMount} from "svelte";
    import { authClient } from "$lib/client";
    import {Tabs, TabsList, TabsTrigger} from "$lib/components/ui/tabs";
    import Login from "$lib/components/Login.svelte";

    function createSamplePage() {
        const factory = new ClientFactory();
        const p = factory.createPage();

        function createText(content: string, styles: Partial<BaseInlineText> = {}) {
            const inline = factory.createInlineText(crypto.randomUUID());
            inline.content = content;
            Object.assign(inline, styles);
            return inline;
        }

        function createSymbol(symbol: BaseInlineSymbolVariant): BaseInlineSymbol {
            return factory.createInlineSymbol(symbol);
        }

        function createBlock(variant: any, inlines: (BaseInlineText | BaseInlineSymbol)[], options: any = {}) {
            const block = factory.createTextBlock(crypto.randomUUID());
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

        function orderedListStyle(prefix: "" | "(", suffix: "." | "" | ")", variant: "number" | "letter_uppercase" | "letter_lowercase" | "roman_uppercase" | "roman_lowercase") {
            return { type: "ordered" as const, prefix, suffix, variant };
        }

        p.setBlocks([
            createBlock("h1", [createText("Welcome to ZiroInk "), createSymbol({type: "emoji", emoji: "📝"})]),
            createBlock("paragraph", [createText("This is a custom rich-text editor built from scratch in Svelte 5. It features pixel-perfect cursor navigation, block variants, and smart lists.")]),
            createBlock("h2", [createText("Core Features")]),
            createBlock("paragraph", [createText("Typography & Formatting")], {
                listType: "unordered",
                listStyle: {type: "bullet"}
            }),
            createBlock("paragraph", [
                createText("You can easily make text "),
                createText("bold", {bold: true}),
                createText(", "),
                createText("italic", {italic: true}),
                createText(", "),
                createText("underlined", {underline: true}),
                createText(", or "),
                createText("struck through", {strikethrough: true}),
                createText(" using keyboard shortcuts (CMD+B, I, U, J).")
            ], {indent: 1}),
            createBlock("paragraph", [createText("Smart Lists & Indentation")], {
                listType: "unordered",
                listStyle: {type: "arrow"}
            }),
            createBlock("paragraph", [createText("Block Variants (H1 - H6)")], {listType: "unordered", listStyle: {type: "dash"}}),
            createBlock("h2", [createText("How Lists Work")]),
            createBlock("paragraph", [createText("Start an ordered list by typing '1.' or 'a)'")], {
                listType: "ordered",
                listStyle: orderedListStyle("", ".", "number")
            }),
            createBlock("paragraph", [createText("This is a continuation block! It has no list indicator, but because it shares the same indentation level as the list item above it, it visually aligns perfectly with the list text. You can create these by pressing Enter and then Backspace to remove the list marker, or Ctrl+Enter.")], {indent: 1}),
            createBlock("paragraph", [createText("Nested lists also work beautifully:")], {
                listType: "ordered",
                listStyle: orderedListStyle("", ".", "number"),
                indent: 2
            }),
            createBlock("paragraph", [createText("Roman numerals!")], {
                listType: "ordered",
                listStyle: orderedListStyle("", ".", "roman_uppercase"),
                indent: 3
            }),
            createBlock("paragraph", [createText("And more roman numerals")], {
                listType: "ordered",
                listStyle: orderedListStyle("", ".", "roman_uppercase"),
                indent: 3
            }),
            createBlock("paragraph", [createText("Letters work too")], {
                listType: "ordered",
                listStyle: orderedListStyle("", ")", "letter_lowercase"),
                indent: 2
            }),
            createBlock("paragraph", [createText("And it keeps counting")], {
                listType: "ordered",
                listStyle: orderedListStyle("", ")", "number"),
                indent: 1
            }),
            createBlock("paragraph", []),
            createBlock("h2", [createText("Inline Symbols")]),
            createBlock("paragraph", [
                createText("You can insert special symbols using shortcuts: "),
                createSymbol({type: "check"}),
                createText(" via "),
                createText("(/)", {code: true}),
                createText(", "),
                createSymbol({type: "x"}),
                createText(" via "),
                createText("(x)", {code: true}),
                createText(" and "),
                createSymbol({type: "question_mark"}),
                createText(" via "),
                createText("(?)", {code: true}),
            ]),
            createBlock("paragraph", [
                createText("Emojis are also supported: "),
                createSymbol({type: "emoji", emoji: "🚀"}),
                createText(" "),
                createSymbol({type: "emoji", emoji: "🎉"}),
                createText(" "),
                createSymbol({type: "emoji", emoji: "🔥"}),
                createText(" — just paste or type them!"),
            ]),
            createBlock("paragraph", []),
        ]);
        p.clearEventQueue();

        return p;
    }

    let page = $state(createSamplePage());
    let keyboardHandler: KeyboardHandler | null = $state(null);
    
    onMount(() => {
        keyboardHandler = new KeyboardHandler(page);
    })
    const session = authClient.useSession();

    let visibleDevTab: "document_tree" | "sync_queue" = $state("document_tree")
</script>

<svelte:window
        oncompositionendcapture={e => { if ($session.data) keyboardHandler?.onCompositionEnd(e); }}
        onkeydowncapture={e => { if ($session.data) keyboardHandler?.onEvent(e); }}
        onbeforeinputcapture={e => { if ($session.data) keyboardHandler?.onBeforeInput(e); }}
        onpastecapture={e => { if ($session.data) keyboardHandler?.onPaste(e); }}
/>

{#if $session.data}
    <div class="w-full h-full flex flex-row">
        <div
                class="h-full flex-1 flex flex-col overflow-y-auto px-12 py-8"
                role="textbox"
                tabindex="-1"
        >
            {#each (page.blocks) as block (block.id)}
                <BlockRenderer
                        block={block}
                        page={page}
                />
            {/each}
            <BottomWhitespace page={page}/>
        </div>
        <div class="h-full flex relative flex-1 bg-gray-50 border-l border-gray-200">
            <div class="absolute top-0 left-0 w-full h-16 p-4 bg-linear-to-b from-gray-50 to-gray-50/0 z-20">
                <Tabs value={visibleDevTab} onValueChange={value => visibleDevTab = value as "document_tree" | "sync_queue"}>
                    <TabsList>
                        <TabsTrigger value="document_tree">Dokumentenbaum</TabsTrigger>
                        <TabsTrigger value="sync_queue">Sync-Warteschlange</TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            <div class="absolute top-0 left-0 flex flex-col w-full h-full p-4 overflow-y-auto pt-16 z-10">
                {#if visibleDevTab === "document_tree"}
                    <JsonView json={{
                cursorX: page.cursorXPosition,
                selection: page.selection,
                blocks: page.blocks.map(b => b.toObject())
            }}/>
                {:else if visibleDevTab === "sync_queue"}
                    <JsonView json={page.eventQueue}/>
                {/if}
            </div>
        </div>
    </div>

    <SelectionManager page={page}/>
{:else}
    <Login />
{/if}
