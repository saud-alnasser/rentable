/**
 * How long a workspace's name may be.
 *
 * **The organization store is the authority and this is a copy of its number**, which is worth stating
 * because a copy across a boundary is a thing that drifts. It is here so a name too long to store
 * is refused before a round trip rather than after one, and so the form can say so beside the
 * field the reader typed in. The service still decides what it stores; nothing here can make it
 * accept a name it would not.
 *
 * *The column itself has no length on it — `workspace.name` is SQLite `TEXT` — so what this bounds
 * is a name no surface can draw rather than one the row cannot hold.*
 */
export const WORKSPACE_NAME_LIMIT = 120;
