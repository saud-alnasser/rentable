import type { RecordCardAction } from '@rentable/design/block/record-card.svelte';
import { toConfirmation, type Blockers } from '@rentable/design/confirmation.js';
import { toShortcutHint, type ShortcutCombination } from '@rentable/design/shortcut.js';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';

/**
 * RECORD ACTS
 *
 * What a person can do to one record, declared once per concept and projected onto every place
 * that offers it: the card's menu and its context menu, the action cluster on the record's own
 * page, and the command menu. A concept writes the ordered list in `<concept>/acts.ts`; nothing
 * a surface draws is written anywhere else, so label, icon, order, tone, shortcut and availability
 * cannot come to differ between two of them.
 *
 * *Why a list and projections rather than per-surface wiring or a registry (effort 832, plan,
 * Architecture 1): wiring each surface writes every act three times and lets them drift, and a
 * runtime registry makes a card's menu depend on what happened to be registered when it drew.*
 *
 * **An act never opens a form or a dialog itself.** Its `run` asks the concept's host, which is
 * mounted once in the frame and owns every form and dialog the concept's acts open.
 */

/** A glyph standing for an act. Lucide only, as every glyph here is. */
export type IconComponent = RecordCardAction['icon'];

/** The groups an act falls in, in the order they appear on every concept. */
export type RecordActGroup = 'primary' | 'lifecycle' | 'destructive';

/**
 * Whether a delete asks before it runs ([[rules/interface]], *Delete and confirm*).
 *
 * `none` deletes at once and offers undo, because the record is all it removes and taking it back
 * is one keystroke. `cascade` asks, because it removes more than the record. `irreversible` asks,
 * because nothing puts it back. What refuses a delete is a separate question: a delete refused
 * asks under any of the three, since the answer is that it cannot be done.
 */
export type ConfirmationPolicy = 'none' | 'cascade' | 'irreversible';

/** One thing a person can do to a record. */
export type RecordAct<T> = {
	/** stable, and the palette's key: `contract.renew`. */
	id: string;
	label: (t: TranslationFunctions) => string;
	icon: IconComponent;
	tone?: 'neutral' | 'error';
	/** separators, and the order across concepts: the `destructive` group comes last. */
	group?: RecordActGroup;
	/** shown on every surface, and answered while a record is focused. */
	shortcut?: ShortcutCombination;
	/** hidden where this says no. */
	appliesTo?: (record: T) => boolean;
	/** shown and refused, with the reason, where this gives one. */
	unavailable?: (record: T, t: TranslationFunctions) => string | undefined;
	/**
	 * whether the host asks before running it. Declared on every act in the `destructive` group,
	 * which `design/tests/acts.test.ts` holds each concept to; the host reads it through
	 * {@link toDeleteStep}.
	 */
	confirmation?: ConfirmationPolicy;
	/** asks the host. */
	run: (record: T) => void;
};

/**
 * What a host does with a delete it was asked for: put the delete dialog in front of the reader,
 * wait on what might refuse it, or run it now.
 */
export type DeleteStep = 'ask' | 'wait' | 'run';

/**
 * The host's answer to a delete, from the act's policy and what refuses it.
 *
 * A delete declared `none` waits on its blockers rather than asking while they are read, so the
 * dialog is never drawn for a record that turns out to have nothing in the way; then it runs, or,
 * where something refuses it, asks, because that dialog is where the refusal is named. A delete
 * declared anything else asks at once and reads its blockers inside the dialog. An act that
 * declares nothing asks: a delete that forgot to say is safer asking than not.
 */
export function toDeleteStep(
	policy: ConfirmationPolicy | undefined,
	blockers: Blockers | undefined
): DeleteStep {
	if (policy !== 'none') {
		return 'ask';
	}

	switch (toConfirmation(blockers).state) {
		case 'awaiting':
			return 'wait';
		case 'blocked':
			return 'ask';
		case 'offered':
			return 'run';
	}
}

/** The acts that apply to this record, in the order they were declared. */
function applying<T>(acts: readonly RecordAct<T>[], record: T) {
	return acts.filter((act) => act.appliesTo?.(record) ?? true);
}

/**
 * What a record's card offers, on both of its routes.
 *
 * The act's id marks the entry as `data-act`, which is what a test or a surface reads an entry
 * by without matching on words that change with the locale.
 */
export function toCardActions<T>(
	acts: readonly RecordAct<T>[],
	record: T,
	t: TranslationFunctions
): RecordCardAction[] {
	return applying(acts, record).map((act) => ({
		label: act.label(t),
		icon: act.icon,
		tone: act.tone ?? 'neutral',
		shortcut: act.shortcut,
		group: act.group,
		unavailable: act.unavailable?.(record, t),
		attributes: { 'data-act': act.id },
		onSelect: () => act.run(record)
	}));
}

/** One control in a record page's action cluster. */
export type PageAction = {
	id: string;
	label: string;
	icon: IconComponent;
	tone: 'neutral' | 'error';
	shortcut?: ShortcutCombination;
	group?: RecordActGroup;
	/** why it cannot be pressed now, or nothing where it can. */
	unavailable?: string;
	run: () => void;
};

/** What a record's own page offers in its action cluster. */
export function toPageActions<T>(
	acts: readonly RecordAct<T>[],
	record: T,
	t: TranslationFunctions
): PageAction[] {
	return applying(acts, record).map((act) => ({
		id: act.id,
		label: act.label(t),
		icon: act.icon,
		tone: act.tone ?? 'neutral',
		shortcut: act.shortcut,
		group: act.group,
		unavailable: act.unavailable?.(record, t),
		run: () => act.run(record)
	}));
}

/** One act as the command menu offers it. */
export type PaletteAct = {
	id: string;
	label: string;
	icon: IconComponent;
	tone: 'neutral' | 'error';
	/** the keys that also run it, as the keyboard prints them. Empty where none reach it. */
	hints: string[];
};

/** One act as the command menu offers it on a record it already holds. */
export type PaletteVerb = PaletteAct & {
	/** why it cannot be run on this record, or nothing where it can. */
	unavailable?: string;
	run: () => void;
};

/** How an act's keys read in the command menu. */
function toHints(shortcut: ShortcutCombination | undefined, isAppleKeyboard: boolean) {
	return shortcut ? [toShortcutHint(shortcut, isAppleKeyboard)] : [];
}

/**
 * What the command menu offers for a record: the acts that apply to it, refused with their reason
 * where one is unavailable.
 */
export function toPaletteVerbs<T>(
	acts: readonly RecordAct<T>[],
	record: T,
	t: TranslationFunctions,
	isAppleKeyboard: boolean
): PaletteVerb[] {
	return applying(acts, record).map((act) => ({
		id: act.id,
		label: act.label(t),
		icon: act.icon,
		tone: act.tone ?? 'neutral',
		hints: toHints(act.shortcut, isAppleKeyboard),
		unavailable: act.unavailable?.(record, t),
		run: () => act.run(record)
	}));
}

/**
 * What the command menu offers before a record is chosen: every act the concept declares, in its
 * order, because which of them apply is not known until the reader names the record. Choosing one
 * asks for the record, and the host answers on the terms {@link toPaletteVerbs} gives for it.
 */
export function toPaletteActs<T>(
	acts: readonly RecordAct<T>[],
	t: TranslationFunctions,
	isAppleKeyboard: boolean
): PaletteAct[] {
	return acts.map((act) => ({
		id: act.id,
		label: act.label(t),
		icon: act.icon,
		tone: act.tone ?? 'neutral',
		hints: toHints(act.shortcut, isAppleKeyboard)
	}));
}
