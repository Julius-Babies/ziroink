# About the project

This is a block-based note-taking app, similar to Notion or Slite. It's cloud first while using optimistic updates. The
project is a Svelte Kit 5 application, using better auth and sqlite/drizzle.

# To consider in the project

## Editor
Every action in the editor that mutates the page should create an event on the sync queue so that all changes get saved
to the server and get synced across devices. This includes things like creating a new block, deleting a block, changing
the content of a block, etc.

If a selection is a blockSelection, then the offset is to be ignored since it targets the entire block.

The page has a special block: The first block is a text block that represents the page's title. It should never be deleted.

# Technical
- Prefer using the svelte 5 runes over the $: **always**

# Tools
- Use bun instead of npm/node