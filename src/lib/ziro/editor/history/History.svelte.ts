import type {Page} from "$lib/ziro/Page.svelte";
import type {Action} from "$lib/ziro/editor/history/Action";

export class History {
    forPage: Page;
    actions: Action[] = $state([]);
    currentIndex: number = $state(-1);

    constructor(forPage: Page) {
        this.forPage = forPage;
    }

    addAction(action: Action) {
        // If we are not at the end of the history, truncate the future
        if (this.currentIndex < this.actions.length - 1) {
            this.actions = this.actions.slice(0, this.currentIndex + 1);
        }
        this.actions.push(action);
        this.currentIndex = this.actions.length - 1;

        // Optional: limit history size
        if (this.actions.length > 100) {
            this.actions.shift();
            this.currentIndex--;
        }
    }

    undo() {
        if (this.currentIndex < 0) return;
        const action = this.actions[this.currentIndex];
        this.currentIndex--;
        return action;
    }

    redo() {
        if (this.currentIndex >= this.actions.length - 1) return;
        this.currentIndex++;
        const action = this.actions[this.currentIndex];
        return action;
    }
}
