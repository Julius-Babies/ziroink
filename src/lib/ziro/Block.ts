export abstract class Block {
    id: string;

    protected constructor(id: string) {
        this.id = id;
    }

    abstract toObject(): any
}