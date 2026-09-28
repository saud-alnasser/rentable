/**
 * The record act capability: the shape of one thing a person can do to a record, and its
 * projections onto the card's menu, the record's page and the command menu. A feature declares
 * its list in its own `acts.ts`. This file is its whole API; a concept imports `$lib/act` and
 * never a file inside it.
 */
export {
	mayRun,
	toCardActions,
	toDeleteStep,
	toPageActions,
	toPaletteActs,
	toPaletteVerbs,
	type ConfirmationPolicy,
	type DeleteStep,
	type IconComponent,
	type PageAction,
	type PaletteAct,
	type PaletteVerb,
	type RecordAct,
	type RecordActGroup
} from './act';
