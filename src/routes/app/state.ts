import {localStorageSyncedWritable} from "$lib/util/LocalStorageSyncedWritable";

export const showPageDeveloperDetails = localStorageSyncedWritable("page.dev.active", false);