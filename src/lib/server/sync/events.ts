export const NEW_PAGE_EVENT_KEY = "new_page";
export const PAGE_METADATA_CHANGED_EVENT_KEY = "page_metadata_chaned";
export const PAGE_DELETED_EVENT_KEY = "page_deleted";

export interface ServerBaseEvent {
    affected_user_ids: string[]
}

export interface ServerNewPageEvent extends ServerBaseEvent {
    page_id: string;
    page_title: string;
    parent_page_id: string | null;
    created_at: number;
    created_by: string;
}

export interface ServerPageDeleteEvent extends ServerBaseEvent {
    page_id: string;
}

export interface ServerPageMetadataChangedEvent extends ServerBaseEvent {
    page_id: string;
    flat_title: { new_title: string } | undefined;
}