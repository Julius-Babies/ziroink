export interface Block {
    id: string;
    sortKey: string;
    indentLevel: number;
    toObject(): any;
}