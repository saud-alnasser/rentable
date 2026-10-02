import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import type { SessionsEnded } from '$lib/organization/host';
import { keys } from '$lib/organization/query';
import { createQuery } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE READER'S OWN SESSION
 *
 * The signed-in member's own password, their machines, and their sessions on every other one.
 */

/**
 * what a sign-out of the reader's other machines, or of one of them, says.
 *
 * A bump that has not gone out means those machines are still open, so the sentence says the
 * sign-out is on its way rather than done (effort 826, requirement 22). Signing one machine out
 * says it of that machine (effort 846, requirement 10).
 */
function endedSentence({ sent }: SessionsEnded, reach: 'others' | 'one') {
	const sentences = reach === 'one' ? get(LL).settings.you.machines : get(LL).settings.you.sessions;

	return sent ? sentences.ended() : sentences.endedPending();
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
	// the machines too: every other machine's row stops naming the reader, so the list is this one.
	invalidates: [keys.state, keys.machines],
	announces: ({ result }) => endedSentence(result, 'others')
});

/**
 * every machine signed in as the reader, this one first (effort 846, requirement 9), as the
 * account section lists them.
 */
export function useFetchMachines() {
	return createQuery(() => ({
		queryKey: keys.machines,
		queryFn: () => api.organization.session.machines()
	}));
}

/**
 * sign one of the reader's other machines out, from its row in the account section (effort 846,
 * requirement 10).
 *
 * **Two sentences, chosen as signing every other machine out chooses them**: the sign-out is
 * written on this machine's replica and pushed, and one that could not go reaches the machine once
 * this one is back online, so it says that rather than that it was done. The list is read again,
 * since the machine stops naming the reader at once.
 */
export const useEndMachine = declareMutation({
	mutate: ({ machineId }: { machineId: string }) =>
		api.organization.session.endMachine({ machineId }),
	touches: 'none',
	toast: { error: true, unexpected: () => get(LL).common.messages.unexpectedError() },
	invalidates: [keys.machines],
	announces: ({ result }) => endedSentence(result, 'one')
});
