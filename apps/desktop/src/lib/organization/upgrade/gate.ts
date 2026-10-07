import { LL, locale } from '$lib/i18n/i18n-svelte';
import { fromStore } from 'svelte/store';

import { useFetchMembers } from '../member/query';
import { useFetchOrganizationState } from '../query';
import { useFetchUpgradeAwaiting } from './query';
import { awaitingOn, isUpgraded, upgradeReason, type GatedStep } from './upgrade';

/**
 * whether the capability gated on `step` may run, and, until it may, why not and who can upgrade
 * (spec requirement 1, ticket 08). Answers from what waits on the data the step is on: once the
 * step has run there, by anybody, it is no longer waiting and the capability runs.
 *
 * A capability's control reads `upgraded` and draws `reason` as its unavailable line, never hiding
 * itself ([[rules/interface]], *An act that cannot run says why at the control*).
 */
export function useUpgraded(step: GatedStep): {
	readonly upgraded: boolean;
	readonly reason: string | undefined;
} {
	const awaitingQuery = useFetchUpgradeAwaiting();
	const stateQuery = useFetchOrganizationState();
	const membersQuery = useFetchMembers();
	const translations = fromStore(LL);
	const language = fromStore(locale);

	return {
		get upgraded() {
			return isUpgraded(awaitingQuery.data, step);
		},
		get reason() {
			if (isUpgraded(awaitingQuery.data, step)) return undefined;

			return upgradeReason(translations.current, language.current, {
				step,
				waiting: awaitingOn(awaitingQuery.data, step.target)?.find(
					({ number }) => number === step.number
				),
				session: stateQuery.data?.session ?? null,
				members: membersQuery.data
			});
		}
	};
}
