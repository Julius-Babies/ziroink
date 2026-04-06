export interface NewPageEvent {
    page_id: string;
    page_title: string;
    parent_page_id: string | null;
    owner_id: string;
    created_at: number;
}

export type NewPageEventWithType = NewPageEvent & { type: "new_page" }

export interface InitialPagesEvent {
    pages: InitialPage[];
}

export interface InitialPage {
    page_id: string;
    title: string;
    created_at: number;
}

export type InitialPagesEventWithType = InitialPagesEvent & { type: "initial_pages" }

export interface PageMetadataChangedEvent {
    page_id: string;
    new_title?: string;
}

export type PageMetadataChangedEventWithType = PageMetadataChangedEvent & { type: "page_metadata_changed" }

export interface PageDeletedEvent {
    page_id: string,
}

export type PageDeletedEventWithType = PageDeletedEvent & { type: "page_deleted" }

export type EventWithType = NewPageEventWithType
    | InitialPagesEventWithType
    | PageMetadataChangedEventWithType
    | PageDeletedEventWithType