import type {Page} from "$lib/ziro/Page.svelte";
import type {Action} from "$lib/ziro/editor/history/Action";

export class History {
    forPage: Page;
    actions: Action[] = $state([]);

    constructor(forPage: Page) {
        this.forPage = forPage;
    }

    addAction(action: Action) {
        this.actions.push(action);
    }
}
