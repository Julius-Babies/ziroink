import { BasePage } from "$lib/ziro/BasePage";
import type { PageEvent } from "$lib/ziro/Events";

export class SveltePage {
    page: BasePage;
    renderTrigger = $state(0);

    constructor(page: BasePage) {
        this.page = page;
        this.page.subscribe((event) => {
            this.renderTrigger++;
        });
    }
}
