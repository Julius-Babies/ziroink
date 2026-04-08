import {writable} from 'svelte/store';

export function localStorageSyncedWritable<T>(key: string, initialValue: T) {
    const storedValue = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
    const initial = storedValue ? JSON.parse(storedValue) : initialValue;

    const store = writable(initial);

    if (typeof window !== 'undefined') {
        store.subscribe((value) => {
            localStorage.setItem(key, JSON.stringify(value));
        });
    }

    return store;
}