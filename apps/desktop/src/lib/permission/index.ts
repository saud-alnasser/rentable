/**
 * The permission capability: what the reader may do to the records of the workspace open, and why
 * not where they may not. The kinds and their flags are read off `@rentable/workspace-permission`.
 * This file is its whole API; a concept imports `$lib/permission` and never a file inside it.
 */
export {
	EXPORT_FLAGS,
	IMPORT_FLAGS,
	memberPermissions,
	refusalOf,
	refusalOfEvery,
	VIEW_FLAG,
	type RecordFlag,
	type RecordKind,
	type Standing
} from './permission';
