/**
 * The command menu capability: what it finds, creates and does to a record, built from what the
 * surfaces declare and handed over by `app/`, and how anything it shows by name is matched. This
 * file is its whole API; a concept imports `$lib/palette`, and the frame renders the menu through
 * `$lib/palette/ui`.
 */
export { toOfferedCreates } from './create';
export {
	createPalette,
	matchesTerm,
	toPaletteShortcuts,
	MATCH_LIMIT,
	type Palette,
	type PaletteActGroup,
	type PaletteDestination,
	type PaletteMatch,
	type PaletteShortcut,
	type RecordSearch,
	type RecordSubject
} from './palette';
