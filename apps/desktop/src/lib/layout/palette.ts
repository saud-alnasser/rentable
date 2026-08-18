import { toShortcutHint } from '$lib/design/shortcut';
import { toShortcutKeys, type ShortcutRegistration } from '$lib/design/shortcut-registry';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { foldSearchText } from '$lib/platform/database/search';

/**
 * PALETTE
 *
 * What the palette offers besides the records it finds: the actions it can run, and how
 * anything it shows is matched against what the reader typed.
 *
 * The actions are **derived from the shortcut registry, not listed here**. Every registration
 * already states its name, why it might be unavailable and what it does, so a second table
 * beside it would be the same facts kept in step by hand — and the palette would go stale the
 * first time a shortcut was added without anyone remembering this file. What this module owns
 * is the projection: which registrations a reader can ask for by name, and what a row of the
 * palette needs to know about one.
 */

/** A concept the palette can ask the reader to choose a record of. */
export type RecordSubject = 'tenant' | 'complex' | 'unit' | 'contract' | 'payment';

/** What every action the palette offers says about itself. */
type PaletteRow = {
	/** the registration's id, which is what keys the row. */
	id: string;
	/** what it does, in the active locale — and therefore what the reader types to find it. */
	label: string;
	/** the keys that also run it, as the keyboard prints them. Empty where none reach it. */
	hints: string[];
	/**
	 * why it cannot be run, in the active locale — or nothing where it can.
	 *
	 * A row carrying one is shown and refused rather than hidden: a reader who typed the name of
	 * an action and got no row learns nothing, and concludes the application cannot do it at all.
	 */
	unavailable?: string;
};

/**
 * One action the palette offers.
 *
 * The two members are the whole of the difference between them, which is whether the palette
 * has to ask something before it can run: an action that acts on a record cannot be run from
 * the row the reader chose, and one that does not cannot be given anything.
 *
 * **Neither of them navigates.** An action reached by name runs where the reader is standing —
 * going to the surface that owns it and running it there is the behaviour this replaces, and it
 * would lose whatever they were in the middle of.
 */
export type PaletteVerb =
	| (PaletteRow & {
			subject?: undefined;
			/** do it. */
			run: () => void;
	  })
	| (PaletteRow & {
			/**
			 * the concept a record must be chosen from first.
			 *
			 * Left as the plain name the registration stated. Matching it against the concepts the
			 * shell searches is what decides whether it can be asked for, so a name matching none of
			 * them offers no records rather than being asserted into one that does not exist.
			 */
			subject: string;
			/** do it, on the record the reader chose. */
			run: (recordId: string) => void;
	  });

/** The member of {@link PaletteVerb} that has to ask before it can run. */
export type RecordPaletteVerb = Extract<PaletteVerb, { subject: string }>;

/**
 * The actions the palette offers, from what is registered.
 *
 * A surface shortcut is not one: the keys that move a list mean nothing where a reader is
 * choosing from a list of names, and there is no `run` behind them to call. An application
 * shortcut is one unless it says otherwise, and a record verb always is — asking for the record
 * is the whole reason it exists.
 *
 * Ordered by name so that two readings of the same registry agree. Registration order is mount
 * order, which is not an order; the reader narrows by typing in any case, so this decides
 * nothing more than which of two rows sits above the other.
 */
export function toPaletteVerbs(
	registered: readonly ShortcutRegistration[],
	translations: TranslationFunctions,
	isAppleKeyboard: boolean
): PaletteVerb[] {
	return registered
		.flatMap<PaletteVerb>((registration) => {
			if (registration.scope === 'surface') {
				return [];
			}

			const row: PaletteRow = {
				id: registration.id,
				label: registration.describe(translations),
				hints: toShortcutKeys(registration).map((combination) =>
					toShortcutHint(combination, isAppleKeyboard)
				),
				unavailable: registration.unavailable?.(translations)
			};

			if (registration.scope === 'record') {
				return [{ ...row, subject: registration.subject, run: registration.run }];
			}

			return registration.offeredInPalette === false ? [] : [{ ...row, run: registration.run }];
		})
		.sort((one, other) => compareLabels(one.label, other.label));
}

/**
 * Order two names.
 *
 * A plain comparison rather than a locale-aware one: `localeCompare` reads the machine's
 * collation rather than the language the application is showing, so the same registry would
 * order itself differently on two machines showing the same words.
 */
function compareLabels(one: string, other: string) {
	if (one === other) {
		return 0;
	}

	return one < other ? -1 : 1;
}

/**
 * Whether something the palette shows by name matches what the reader has typed.
 *
 * Folded on both sides through the comparison every list and every record search uses, so a
 * name is found however either side spells it — the palette is the one surface where a term is
 * matched against text held in memory rather than in a column, and matching it any other way
 * would make the palette the one place an Arabic name typed with a different alef finds
 * nothing.
 *
 * An empty term matches everything, which is what opens the palette on the whole of what it
 * offers rather than on nothing.
 */
export function matchesTerm(label: string, term: string) {
	const typed = foldSearchText(term.trim()).toLowerCase();

	return !typed || foldSearchText(label).toLowerCase().includes(typed);
}
