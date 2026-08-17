import { FILTER_PERIODS } from '$lib/api/period';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * LIST FILTER
 *
 * What a list declares about the narrowing it offers, and what the block needs to draw it.
 *
 * The block has carried the position for a filter since it was written — the slot was there and
 * one surface in the application filled it, with a control it built by hand. **A declaration is
 * the other half.** A list now says which filters it offers and from what vocabulary, and the
 * block draws every one of them the same way, exactly as it already does for sort: `sortOptions`
 * says what is offered and `sort` holds what is chosen.
 *
 * Nothing here narrows anything. A chosen value reaches the concept's own read and the narrowing
 * happens there, because a filter that shortened a loaded list would be a filter over what was
 * fetched rather than over what exists — which is a different question and usually the wrong
 * answer. [[rules/data]], under *List reads*, forbids it outright.
 */

/** One value a filter can be set to. */
export type FilterOption = {
	/** what the read is given, and what a chosen state is compared against. */
	id: string;
	/** what the reader sees, in their language. */
	label: (translations: TranslationFunctions) => string;
};

/** What every declared filter says about itself. */
type FilterSubject = {
	/** what names it, and what keys its chosen value. */
	id: string;
	/** what it narrows by — the word before the value on the control. */
	label: (translations: TranslationFunctions) => string;
};

/** A filter over a fixed set of named values the concept defines. */
export type ChoiceFilter = FilterSubject & {
	kind: 'choice';
	options: FilterOption[];
};

/**
 * A filter over a span of time.
 *
 * Its values are the shared vocabulary rather than this list's own: two surfaces asked about the
 * same period have to cover the same days, and the surface that will have to agree with this one
 * is on another router entirely.
 */
export type PeriodFilter = FilterSubject & { kind: 'period' };

/**
 * The period filter itself, declared once.
 *
 * A list offering a period does not describe one — it offers *this* one. Two surfaces that must
 * agree about a span of time cannot do so by each naming their own filter with its own id, and
 * the pair that has to agree is on two different routers.
 */
export const PERIOD_FILTER: PeriodFilter = {
	kind: 'period',
	id: 'period',
	label: (translations) => translations.common.labels.period()
};

/** A filter, as a list declares it. */
export type ListFilter = ChoiceFilter | PeriodFilter;

/** What a list is narrowed to: a filter's id against the value chosen for it, or nothing. */
export type FilterSelection = Record<string, string | undefined>;

/**
 * The values a filter offers, whichever kind it is.
 *
 * A period's are the shared vocabulary's, read here rather than restated by every list that
 * offers one — a list declares *that* it filters by period, never which periods exist.
 */
export function toFilterOptions(filter: ListFilter): FilterOption[] {
	if (filter.kind === 'choice') {
		return filter.options;
	}

	return FILTER_PERIODS.map((period) => ({
		id: period,
		label: (translations: TranslationFunctions) => translations.common.periods[period]()
	}));
}

/**
 * How a filter reads at rest: what it narrows by, and what it is narrowed to.
 *
 * The chosen value is on the control rather than behind it, which is the whole difference
 * between a list a reader can trust and one that is quietly showing them a subset. An unset
 * filter reads as its own name, which is also the invitation to open it.
 */
export function toFilterLabel(
	filter: ListFilter,
	selection: FilterSelection,
	translations: TranslationFunctions
): string {
	const chosen = toChosenOption(filter, selection);
	const name = filter.label(translations);

	return chosen ? `${name}: ${chosen.label(translations)}` : name;
}

/**
 * What a filter is set to, or nothing where it is not set.
 *
 * Distinct from {@link toFilterLabel}, which names the filter whether or not it is in use — a
 * control has to be labelled either way, and a file name has nothing to say about a filter
 * nobody applied.
 */
export function toChosenLabel(
	filter: ListFilter,
	selection: FilterSelection,
	translations: TranslationFunctions
) {
	return toChosenOption(filter, selection)?.label(translations);
}

/** The option a filter is set to, or nothing where it is not set. */
export function toChosenOption(
	filter: ListFilter,
	selection: FilterSelection
): FilterOption | undefined {
	const chosen = selection[filter.id];

	return chosen === undefined
		? undefined
		: toFilterOptions(filter).find((option) => option.id === chosen);
}

/**
 * The selection with one filter set, or cleared where the value is nothing.
 *
 * A cleared filter is **removed rather than set to a blank**, so a selection carries only what
 * is actually narrowing. That is what lets a caller ask whether a list is filtered at all
 * without knowing which filters it declared.
 */
export function withFilter(
	selection: FilterSelection,
	filterId: string,
	value: string | undefined
): FilterSelection {
	const next = { ...selection };

	if (value === undefined) {
		delete next[filterId];
	} else {
		next[filterId] = value;
	}

	return next;
}

/** Whether anything is narrowing the list. */
export function hasAnyFilter(selection: FilterSelection): boolean {
	return Object.values(selection).some((value) => value !== undefined);
}
