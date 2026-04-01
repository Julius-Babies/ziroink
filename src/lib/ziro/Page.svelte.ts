import type {Block} from "$lib/ziro/Block";


export class Page {
    blocks: Block[] = $state([])
    selection: null | {
        start: SelectionPosition;
        end: SelectionPosition | null;
    } = $state(null);

    insertBlock(block: Block) {
        this.blocks = [...this.blocks, block]
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