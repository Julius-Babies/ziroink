export function isInsertLineBreak(event: KeyboardEvent): boolean {
    return event.key === "Enter" && event.shiftKey
}

export function isNewBlock(event: KeyboardEvent): boolean {
    return event.key === "Enter" && !event.shiftKey
}

export function isToggleStyle(event: KeyboardEvent): boolean {
    return ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) && (["b", "i", "u", "j"].includes(event.key))
}

export function isArrowKey(key: string): boolean {
    return ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key);
}