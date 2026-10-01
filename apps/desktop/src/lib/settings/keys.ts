/**
 * The cache keys of this machine's settings, which a write elsewhere that changes them refreshes.
 *
 * A plain module rather than `./query`'s, so the entry that loads under Node can hand them over:
 * they are constants, and the workspace reads them from code its `node:test`s load (effort 843,
 * ticket 04, when `./ui` came to export a component).
 */
export const keys = {
	all: ['settings'],
	settings: ['settings', 'data']
} as const;
