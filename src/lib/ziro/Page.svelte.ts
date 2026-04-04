import type {Block} from "$lib/ziro/Block";


export class Page {
    blocks: Block[] = $state([])
    selection: null | {
        start: SelectionPosition;
        end: SelectionPosition | null;
    } = $state(null);

    insertBlock(block: Block, position: { type: "after_block", afterId: string } | { type: "end" }) {
        if (position.type === "after_block") {
            const index = this.blocks.findIndex(b => b.id === position.afterId);
            if (index === -1) {
                throw new Error("Failed to find block with id " + position.afterId);
            }

            this.blocks = [...this.blocks.slice(0, index + 1), block, ...this.blocks.slice(index + 1)]
            return;
        } else if (position.type === "end") {
            this.blocks = [...this.blocks, block]
        }
    }

    findBlock(predicate: (block: Block) => boolean) {
        return this.blocks.find(predicate);
    }

    setSelection(start: SelectionPosition, end: SelectionPosition | null) {
        this.selection = { start: start, end: end };
    }
}

export interface SelectionPosition {
    blockId: string;
    offset: number;
}