<script lang="ts">
    import {BaseTextBlock} from "$lib/ziro/BaseTextBlock";
    import type {BasePage} from "$lib/ziro/BasePage";

    let {
        block,
        page
    }: {
        block: BaseTextBlock,
        page: BasePage
    } = $props();

    function getOrderedListItemIndex(): number {
        const currentIndex = page.blocks.indexOf(block);
        let count = 0;
        for (let i = currentIndex; i >= 0; i--) {
            const b = page.blocks[i];
            if (b instanceof BaseTextBlock) {
                if (b.indentLevel < block.indentLevel) {
                    break;
                }
                if (b.indentLevel === block.indentLevel && b.listType === "ordered") {
                    count++;
                }
            }
        }
        return count;
    }

    function toRoman(num: number): string {
        const lookup: Record<string, number> = {M:1000,CM:900,D:500,CD:400,C:100,XC:90,L:50,XL:40,X:10,IX:9,V:5,IV:4,I:1};
        let roman = '';
        for (let i in lookup) {
            while (num >= lookup[i]) {
                roman += i;
                num -= lookup[i];
            }
        }
        return roman;
    }

    function getOrderedMarker(): string {
        if (!block.listStyle || block.listStyle.type !== "ordered") return "";
        const style = block.listStyle;
        const index = getOrderedListItemIndex();

        let value: string;
        switch (style.variant) {
            case "number":
                value = String(index);
                break;
            case "letter_uppercase":
                value = String.fromCharCode(64 + ((index - 1) % 26) + 1);
                break;
            case "letter_lowercase":
                value = String.fromCharCode(96 + ((index - 1) % 26) + 1);
                break;
            case "roman_uppercase":
                value = toRoman(index);
                break;
            case "roman_lowercase":
                value = toRoman(index).toLowerCase();
                break;
            default:
                value = String(index);
        }

        return (style.prefix || "") + value + (style.suffix || "");
    }
</script>
{#if (block.listStyle)}
    <div class="w-8 flex content-center justify-center select-none">
        {#if (block.listStyle)?.type === "bullet"}
            <span>&bullet;</span>
        {:else if (block.listStyle)?.type === "dash"}
            <span>&dash;</span>
        {:else if (block.listStyle)?.type === "arrow"}
            <span>-></span>
        {:else if (block.listStyle)?.type === "ordered"}
            <span>{getOrderedMarker()}</span>
        {/if}
    </div>
{/if}