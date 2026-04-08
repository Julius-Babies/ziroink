# About the project

This is a block-based note-taking app, similar to Notion or Slite. It's cloud first while using optimistic updates. The
project is a Svelte Kit 5 application, using better auth and sqlite/drizzle.

# To consider in the project

Every action in the editor that mutates the page should create an event on the sync queue so that all changes get saved
to the server and get synced across devices. This includes things like creating a new block, deleting a block, changing
the content of a block, etc.

# Technical
- Prefer using the svelte 5 runes over the $: **always**

# Tools

- Use bun instead of npm/node