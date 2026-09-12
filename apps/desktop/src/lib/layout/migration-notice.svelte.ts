import type { MigrationNotice } from '$lib/platform/host';

/**
 * Where a workspace upgrade is, for the loading screen to say.
 *
 * The shell records what Rust announces while `workspace_open` brings a workspace up to this
 * build's schema, and the loading screen reads it. `done` is kept rather than cleared so a screen
 * that mounts after the last notice draws nothing, and the next open's first notice replaces it.
 * A runes file, like `startup-stage.svelte.ts` beside it, for the same reason: it is read by a
 * component and written from outside one.
 */
export const migrationNotice = $state<{ current: MigrationNotice | null }>({ current: null });

export function noteMigration(notice: MigrationNotice) {
	migrationNotice.current = notice;
}
