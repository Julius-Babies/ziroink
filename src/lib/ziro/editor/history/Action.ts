import type {Page, Selection} from "$lib/ziro/Page.svelte.js";
import type {PageEvent} from "$lib/ziro/Events";

export class Action {
    takenIn: Page;
    takenAt: Date;
    events: PageEvent[];
    selection_before: Selection | null = null;
    selection_after: Selection | null = null;

    constructor(takenIn: Page, events: PageEvent[]) {
        this.takenIn = takenIn;
        this.takenAt = new Date();
        this.events = events;
    }

    addEvent(event: PageEvent) {
        this.events.push(event);
    }
}