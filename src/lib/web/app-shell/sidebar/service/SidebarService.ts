import type {ApiPage} from "$lib/web/app-shell/sidebar/model/ApiPage";
import {get, readable, type Readable, writable} from "svelte/store";
import type {EventWithType} from "$lib/web/app-shell/sidebar/model/events";

export abstract class SidebarService {
    abstract getAll(): Readable<ApiPage[]>
    abstract create(): Promise<{ page_id: string }>
    abstract delete(page_id: string): Promise<void>

    abstract close(): void
}

export class WebSidebarService implements SidebarService {
    private pages = writable<ApiPage[]>([])

    private source: EventSource | null = null;

    getAll(): Readable<ApiPage[]> {
        if (!this.source) {
            this.source = new EventSource('/api/feature/app-shell/sidebar');
            this.source.onmessage = (event) => {
                const eventData: EventWithType = JSON.parse(event.data);
                if (eventData.type === "initial_pages") {
                    const newApiPages: ApiPage[] = eventData.pages.map(page => ({
                        id: page.page_id,
                        created_at: new Date(page.created_at),
                        title: page.title,
                    }));
                    this.pages.set(newApiPages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime()));
                } else if (eventData.type === "new_page") {
                    if (!get(this.pages).find(p => p.id === eventData.page_id)) {
                        const newApiPage: ApiPage = {
                            id: eventData.page_id,
                            created_at: new Date(eventData.created_at),
                            title: eventData.page_title,
                        }
                        this.pages.update(pages => {
                            return [...pages, newApiPage].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
                        })
                    }
                } else if (eventData.type === "page_metadata_changed") {
                    this.pages.update(pages => {
                        return pages.map(page => {
                            if (page.id !== eventData.page_id) return page;

                            let changedPage = page;

                            if (eventData.new_title !== undefined) {
                                changedPage.title = eventData.new_title;
                            }

                            return changedPage;
                        })
                    })
                } else if (eventData.type === "page_deleted") {
                    this.pages.update(pages => {
                        return pages.filter(p => p.id !== eventData.page_id);
                    })
                }
            };
        }
        return readable<ApiPage[]>([], set => this.pages.subscribe(set))
    }

    async create(): Promise<{ page_id: string }> {
        const res = await fetch('/api/pages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error('Failed to create page');

        const response = await res.json();
        return { page_id: response.id };
    }

    async delete(page_id: string): Promise<void> {
        await fetch(`/api/pages/${page_id}`, {
            method: 'DELETE',
        });
    }

    close() {
        if (this.source) {
            this.source.close()
            this.source = null;
        }
    }
}

export const sidebarService = new WebSidebarService();