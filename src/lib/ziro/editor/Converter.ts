import type {Block} from "$lib/ziro/Block";
import {BaseInline, InlineText, TextBlock} from "$lib/ziro/TextBlock.svelte";
import type {Page} from "$lib/ziro/Page.svelte";

export class Converter {
    static blocksToText(blocks: Block[], page: Page): string {
        return blocks.map(block => {
            let text = "";
            const indentPrefix = " ".repeat((block.indentLevel - (block instanceof TextBlock ? block.listStyle ? 1 : 0 : 0)) * 2)
            text += indentPrefix;
            let listPrefixLength = 0;
            if (block instanceof TextBlock) {
                if (block.listStyle && block.listStyle.type === "ordered") {
                    let listPrefix = block.getOrderedMarker(page) + " "
                    listPrefixLength = listPrefix.length;
                    text += listPrefix
                } else if (block.listStyle && block.listStyle.type === "checkbox") {
                    let prefix = "[" + (block.listStyle.checked ? "x" : " ") + "] "
                    listPrefixLength = prefix.length;
                    text += prefix
                } else if (block.listStyle && block.listStyle.type === "bullet") {
                    let prefix = "• "
                    listPrefixLength = prefix.length;
                    text += prefix
                } else if (block.listStyle && block.listStyle.type === "dash") {
                    let prefix = "- "
                    listPrefixLength = prefix.length;
                } else if (block.listStyle && block.listStyle.type === "arrow") {
                    let prefix = "→ "
                    listPrefixLength = prefix.length;
                    text += prefix
                }
                const contentIndentation = listPrefixLength + indentPrefix.length;
                const lines = block.toDisplayText().split("\n");
                if (lines.length > 0) text += lines[0]
                if (lines.length > 1) text += lines.slice(1, lines.length).map(line => "\n" + " ".repeat(contentIndentation) + line);
            }

            return text;
        }).join("\n");
    }

    static blocksToHtml(blocks: Block[], page: Page, isBlockSelection: boolean): string {
        const container = document.createElement("div");
        const listStack: { element: HTMLOListElement | HTMLUListElement, indent: number }[] = [];

        for (const block of blocks) {
            if (!(block instanceof TextBlock)) continue;

            // Manage list nesting
            const currentIndent = block.indentLevel;
            while (listStack.length > 0 && listStack[listStack.length - 1].indent > currentIndent) {
                listStack.pop();
            }

            if (block.listStyle) {
                if (listStack.length === 0 || listStack[listStack.length - 1].indent < currentIndent) {
                    const listTag = block.listStyle.type === "ordered" ? "ol" : "ul";
                    const newList = document.createElement(listTag);
                    
                    if (block.listStyle.type === "ordered") {
                        const style = block.listStyle;
                        if (style.variant === "letter_uppercase") newList.type = "A";
                        else if (style.variant === "letter_lowercase") newList.type = "a";
                        else if (style.variant === "roman_uppercase") newList.type = "I";
                        else if (style.variant === "roman_lowercase") newList.type = "i";
                    } else {
                        // Unordered
                        if (block.listStyle.type === "bullet") newList.style.listStyleType = "disc";
                        else if (block.listStyle.type === "dash") newList.style.listStyleType = "'- '";
                        else if (block.listStyle.type === "arrow") newList.style.listStyleType = "'→ '";
                    }

                    const target = listStack.length > 0 ? listStack[listStack.length - 1].element : container;
                    // If the last thing in the parent was an LI, we should probably append to that LI to be semantically correct
                    if (target.lastElementChild?.tagName === "LI") {
                        target.lastElementChild.appendChild(newList);
                    } else {
                        target.appendChild(newList);
                    }
                    listStack.push({ element: newList, indent: currentIndent });
                }
                
                const li = document.createElement("li");
                const itemContainer = block.variant === "paragraph" ? li : li.appendChild(document.createElement(block.variant));
                this.appendInlines(itemContainer, block.inlines);
                
                // Handle checkboxes inside LI
                if (block.listStyle.type === "checkbox") {
                    li.style.listStyleType = "none";
                    const check = document.createElement("span");
                    check.textContent = block.listStyle.checked ? "☑ " : "☐ ";
                    itemContainer.prepend(check);
                }

                listStack[listStack.length - 1].element.appendChild(li);
            } else {
                // Not a list item
                const tag = block.variant === "paragraph" ? "p" : block.variant;
                const el = document.createElement(tag);
                if (currentIndent > 0) {
                    el.style.marginLeft = `${currentIndent * 20}px`;
                }
                this.appendInlines(el, block.inlines);
                container.appendChild(el);
                // Clear list stack as we exited a list
                listStack.length = 0;
            }
        }

        return `<!-- Ziro-Application-Clipboard-Blocks=${btoa(JSON.stringify(blocks.map(b => b.toObject())))} -->\n<!-- Ziro-Application-Clipboard-IsBlockSelection=${isBlockSelection} -->\n${container.innerHTML}`;
    }

    private static appendInlines(element: HTMLElement, inlines: BaseInline[]) {
        for (const inline of inlines) {
            let node: Node;
            const text = inline.toDisplayText();
            
            if (inline instanceof InlineText) {
                let current: HTMLElement | null = null;
                const addWrapper = (tag: string) => {
                    const wrapper = document.createElement(tag);
                    if (!current) {
                        current = wrapper;
                        node = current;
                    } else {
                        let deep: HTMLElement = current;
                        while (deep.firstElementChild) {
                            deep = deep.firstElementChild as HTMLElement;
                        }
                        deep.appendChild(wrapper);
                    }
                };

                if (inline.bold) addWrapper("b");
                if (inline.italic) addWrapper("i");
                if (inline.underline) addWrapper("u");
                if (inline.strikethrough) addWrapper("s");
                if (inline.code) addWrapper("code");

                if (current) {
                    let leaf: HTMLElement = current;
                    while (leaf.firstElementChild) {
                        leaf = leaf.firstElementChild as HTMLElement;
                    }
                    leaf.textContent = text;
                    node = current!;
                } else {
                    node = document.createTextNode(text);
                }
            } else {
                node = document.createTextNode(text);
            }
            element.appendChild(node);
        }
    }
}
