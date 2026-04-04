export interface Block {
    id: string;
    indentLevel: number;
    toObject(): any;
}