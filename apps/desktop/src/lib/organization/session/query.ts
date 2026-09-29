import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation';
import { LL } from '$lib/i18n/i18n-svelte';
import type { SessionsEnded } from '$lib/organization/host';
import { keys } from '$lib/organization/query';
import { get } from 'svelte/store';

/**
 * THE READER'S OWN SESSION
 *
 * The signed-in member's own password, and their sessions on every other machine.
 */

/**
 * what a sign-out of the reader's other machines says.
 *
 * A bump that has not gone out means those machines are still open, so the sentence says the
 * sign-out is on its way rather than done (effort 826, requirement 22).
 */
function endedSentence({ sent }: SessionsEnded) {
	const translations = get(LL);

	return sent
		? translations.settings.you.sessions.ended()
		: translations.settings.you.sessions.endedPending();
}

/**
 * the signed-in member's own password, changed from the account page. The refusal a person
 * can act on, a password under the floor or a current one that did not open, is shown.
 */
export const useChangePassword = declareMutation({
	mutate: ({ current, next }: { current: string; next: string }) =>
		api.organization.password.change({ current, next }),
	touches: 'none',
	toast: {
		success: () => get(LL).settings.you.password.changed(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * end the reader's own sessions on every other machine, from the account section (effort 826,
 * requirement 22).
 *
 * **This machine stays signed in**, so there is nothing to invalidate but where the machine
 * stands: the session the screen is drawn from is the same one, under a number that moved. The
 * toast is what tells the person it happened, because nothing on screen changes.
 *
 * **And it tells them which of two things happened.** The bump is written on this machine's
 * replica and pushed; a machine with no connection cannot push, and the other machines stay open
 * until one of its heartbeats can. Saying *they were signed out* then would be false about the
 * one thing this act is for, so the sentence says the sign-out is pending instead.
 */
export const useEndOtherSessions = declareMutation({
	mutate: () => api.organization.session.endElsewhere(),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	invalidates: [keys.state],
	announces: ({ result }) => endedSentence(result)
});
