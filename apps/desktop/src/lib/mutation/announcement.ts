import { recordDiagnosticError } from '$lib/platform/diagnostics';
import { NAMED_RECORDS, unforeseenRefusals } from '@rentable/design/selection.js';
import { LL } from '$lib/i18n/i18n-svelte';
import { readHostRefusal, toRefusalText, toRouterFailureText } from '$lib/error/refusal';
import { toTauriErrorCode } from '$lib/error/tauri';
import { notify } from '$lib/notification';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { TRPCError } from '@trpc/server';
import { announceWithOffer, type UndoOffer } from '$lib/undo';
import { get } from 'svelte/store';

/**
 * WHAT A MUTATION SAYS
 *
 * the announcements every mutation raises, declared or not: what it did, what it could not do,
 * and what the workspace refused. `mutation.ts` binds a declaration to these; a surface acting
 * without one reaches the success and the error handlers through the capability's entry.
 */

type ToastMessage = string | (() => string);

/**
 * What a declaration says about a refusal once it has seen it: `true` raises the refusal's own
 * words, a sentence raises that sentence, and `null` raises nothing, for a refusal the surface
 * says in place (the walk's group field is the one today). A decider is the only way a
 * declaration can keep one refusal out of the toast without a surface raising the rest itself,
 * which is the direct `toast` call [[rules/frontend]] forbids under *Data access*.
 */
type ToastErrorDecision = boolean | string | null;

export type MutationOptions = {
	toast?: {
		success?: ToastMessage;
		/**
		 * a second line under the announcement. A delete that runs at once declares the one the
		 * delete dialog used to carry, that it can be taken back while the application is open,
		 * because no dialog is shown to say it any more ([[rules/interface]], *Delete and confirm*).
		 */
		detail?: ToastMessage;
		error?: boolean | ToastMessage | ((error: Error) => ToastErrorDecision);
		unexpected?: ToastMessage;
	};
};

function resolveToastMessage(message: ToastMessage) {
	return typeof message === 'function' ? message() : message;
}

/**
 * What the declaration decided about this refusal: a decider is asked, a thunk is resolved, and
 * a boolean or a sentence is itself.
 */
function decideErrorToast(
	option: NonNullable<MutationOptions['toast']>['error'],
	error: Error
): ToastErrorDecision | undefined {
	if (typeof option === 'function') {
		// a thunk ignores the argument and answers its sentence; a decider reads it.
		return (option as (error: Error) => ToastErrorDecision)(error);
	}

	return option;
}

export function onMutationSuccess(opts: MutationOptions, offer?: UndoOffer) {
	if (!opts.toast?.success) {
		return;
	}

	const message = resolveToastMessage(opts.toast.success);
	// only where one is declared, so an announcement without one is raised exactly as before.
	const detail = opts.toast.detail && { description: resolveToastMessage(opts.toast.detail) };

	if (!offer) {
		notify.success(message, detail || undefined);

		return;
	}

	// the offer riding on the announcement is undo's: the control, how long it stays, and whether
	// the reader may take it at all.
	announceWithOffer(message, detail || undefined, offer);
}

/**
 * Raise what a mutation could not do, beside what it did.
 *
 * The third of the shared handlers, and it exists for the same reason as the other two: an
 * announcement raised from the surface that called a mutation is a `toast` call in a component,
 * which is what [[rules/frontend]] under *Data access* forbids. This one is a warning rather than
 * a success or an error, because the mutation did not fail: it did what it could and part of what
 * was asked for was no longer possible.
 *
 * A declaration with nothing to say answers with nothing, and nothing is raised.
 *
 * Left out of the capability's entry, unlike the other two, because only `bindMutation` in
 * `mutation.ts` raises it. The other two are reached by surfaces that act without a declaration
 * behind them, and there is no such caller for a notice: a notice is about a plan, and a plan comes
 * from a declared mutation.
 */
export function onMutationNotice(message: string | undefined) {
	if (message) {
		notify.warning(message);
	}
}

/**
 * What a multi-record action says when the workspace moved under an open confirmation.
 *
 * Every list that plans before it acts says the same thing, so it is worded once. The comparison
 * itself is the design package's `selection.ts`'s, because it is selection vocabulary and stays free of the
 * reader's language; putting it in words is here, because this is where announcements are worded.
 *
 * **Answers with nothing where the outcome matched the plan**, which is what withholds the notice
 * on the ordinary path.
 *
 * **A record that cannot be named is counted rather than called something generic.** The reason
 * this notice usually fires is that another device removed a record mid-decision, and such a
 * record arrives with an empty name, having nothing left to be called by. Forty of them named by
 * their concept's label is the word *tenant* forty times, which says less than the number does.
 * Past a handful the names stop being something to act on, which is the bound
 * {@link NAMED_RECORDS} already sets for the confirmation this notice follows.
 */
export function describeOutcomeChange<TRefusal extends { id: string }>(
	foreseen: readonly string[],
	refused: readonly TRefusal[],
	nameOf: (refusal: TRefusal) => string
): string | undefined {
	const unforeseen = unforeseenRefusals(foreseen, refused);

	if (unforeseen.length === 0) {
		return undefined;
	}

	const translations = get(LL);
	const named = unforeseen.map(nameOf).filter((name) => name.length > 0);

	if (named.length === 0) {
		return translations.common.selection.outcomeChangedCount({ count: unforeseen.length });
	}

	const shown = named.slice(0, NAMED_RECORDS);
	// counted against every record that was turned away rather than against the ones that could be
	// named, so a set that is half nameless is not silently reported as the half that had names.
	const rest = unforeseen.length - shown.length;

	return translations.common.selection.outcomeChanged({
		records:
			rest > 0
				? `${shown.join(', ')} ${translations.common.selection.more({ count: rest })}`
				: shown.join(', ')
	});
}

export function onMutationError(opts: MutationOptions, e: Error) {
	const errorToast = decideErrorToast(opts.toast?.error, e);

	// the declaration says this refusal is said elsewhere, and nothing is raised for it.
	if (errorToast === null) {
		return;
	}

	if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
		if (errorToast === true) {
			// a refusal crosses as a code, and this is where it becomes the reader's words.
			notify.error(toRefusalText(e, get(LL)));
		} else if (typeof errorToast === 'string') {
			notify.error(errorToast);
		}
	} else if (readHostRefusal(e)) {
		// the shell refuses with a reason, and its message is a developer's description: the
		// reason is what becomes the reader's words (effort 832, requirement 23).
		if (errorToast === true) {
			notify.error(toRefusalText(e, get(LL)));
		} else if (typeof errorToast === 'string') {
			notify.error(errorToast);
		}
	} else {
		// what the error was raised with is a developer's description, in English whatever the
		// reader's language, so it is kept for diagnostics and never becomes the toast.
		recordDiagnosticError('mutation.failed', {
			code: e instanceof TRPCError ? e.code : null,
			detail: e.message
		});

		const translations = get(LL);
		const sentence = toKnownFailureText(e, translations);
		const permission = toRouterFailureText(e, translations);

		if (permission) {
			// a permission failure is not the generic failure a declaration turns off with
			// `error: false`: that setting is about refusals a form places itself, and a caller
			// the middlewares turned away has a sentence of its own to be told.
			notify.error(permission);
		} else if (errorToast === true && sentence) {
			notify.error(sentence);
		} else if (typeof errorToast === 'string') {
			notify.error(errorToast);
		} else if (opts.toast?.unexpected) {
			notify.error(resolveToastMessage(opts.toast.unexpected));
		} else if (errorToast === true) {
			notify.error(translations.common.messages.unexpectedError());
		}
	}
}

/**
 * The sentence for a failure that is neither a refusal nor unexpected: a permission failure a
 * router raised, or a failure the shell sent with a code. `null` for anything else, which reads as
 * the declaration's unexpected sentence or the generic one.
 */
function toKnownFailureText(e: Error, translations: TranslationFunctions): string | null {
	const code = toTauriErrorCode(e);

	return toRouterFailureText(e, translations) ?? (code ? translations.common.errors[code]() : null);
}
