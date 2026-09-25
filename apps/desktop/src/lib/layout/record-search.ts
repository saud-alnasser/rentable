import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import type { RecordMatch } from '$lib/api/search';
import { complexActs, complexHost } from '$lib/complex/host.svelte';
import { useSearchComplexes, useSearchUnits } from '$lib/complex/query';
import { unitActs, unitHost } from '$lib/complex/unit/host.svelte';
import { contractActs, contractHost } from '$lib/contract/host.svelte';
import { useSearchContracts } from '$lib/contract/query';
import { toPaletteActs, type PaletteAct } from '$lib/design/acts';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { RecordSearch, RecordSubject } from '$lib/layout/palette';
import { useOrganizationOfferings } from '$lib/organization/palette';
import { paymentActs, paymentHost } from '$lib/payment/host.svelte';
import { useSearchPayments } from '$lib/payment/query';
import { tenantActs, tenantHost } from '$lib/tenant/host.svelte';
import { RECORD_PARAM, WORKSPACE_PARAM, withSection } from '$lib/settings/section';
import { useSearchTenants } from '$lib/tenant/query';

/**
 * RECORD SEARCH
 *
 * which concepts the palette offers records of, what each group is called, and where opening
 * one goes. The searching itself belongs to each concept — this is the shell's table of what
 * it presents and in what order, which is the shell's own question.
 *
 * **A member and a workspace are found only while one of their acts asks for one.** They are
 * opened from their settings directory, and the menu reaches them to run an act on them; their
 * acts are gated on who is reading, so the organization reads what they are gated on and offers
 * only the acts that reader may take (`organization/palette.ts`).
 */

/** How many records of each concept the palette offers before the reader narrows further. */
const MATCH_LIMIT = 5;

/** One concept the palette can find records of. */
type RecordConcept = {
	/** what an action asking for one of these records names it. */
	subject: RecordSubject;
	/** what the group is called, in the reader's language. */
	heading: (translations: TranslationFunctions) => string;
	/** the record's own page — what opening a match reaches (ADR 0025). */
	href: (match: RecordMatch) => ResolvedPathname;
	/**
	 * the concept's own search, bound to the term the palette is holding and to the act waiting for
	 * a record, where one is. A search that answers whatever act is waiting ignores the second.
	 */
	find: (term: () => string, asked: () => string | null) => RecordSearch;
	/**
	 * what the palette offers to do to one of these records, where the concept has declared its
	 * acts: every act in the concept's own order, and how one is run on the record the reader then
	 * chooses. The concept's host reads that record and answers on its terms.
	 */
	acts?: {
		offered: (translations: TranslationFunctions, isAppleKeyboard: boolean) => PaletteAct[];
		runOn: (actId: string, recordId: string) => void;
	};
};

/**
 * The concepts the palette searches, in the order it presents them.
 *
 * A hook, because what a member's and a workspace's acts are gated on is read from queries, and
 * those are read only while `isOpen` says the palette is showing.
 */
export function useRecordConcepts(isOpen: () => boolean): RecordConcept[] {
	const organization = useOrganizationOfferings(isOpen);

	return [
		{
			subject: 'tenant',
			heading: (t) => t.common.nav.tenants(),
			href: (match) => resolve(`/tenants/${match.id}`),
			find: (term) => useSearchTenants(term, MATCH_LIMIT),
			acts: {
				offered: (t, isAppleKeyboard) => toPaletteActs(tenantActs, t, isAppleKeyboard),
				runOn: (actId, tenantId) => tenantHost.runOn(actId, tenantId)
			}
		},
		{
			subject: 'complex',
			heading: (t) => t.common.nav.complexes(),
			href: (match) => resolve(`/complexes/${match.id}`),
			find: (term) => useSearchComplexes(term, MATCH_LIMIT),
			acts: {
				offered: (t, isAppleKeyboard) => toPaletteActs(complexActs, t, isAppleKeyboard),
				runOn: (actId, complexId) => complexHost.runOn(actId, complexId)
			}
		},
		{
			subject: 'unit',
			heading: (t) => t.common.nav.units(),
			href: (match) => resolve(`/complexes/units/${match.id}`),
			find: (term) => useSearchUnits(term, MATCH_LIMIT),
			acts: {
				offered: (t, isAppleKeyboard) => toPaletteActs(unitActs, t, isAppleKeyboard),
				runOn: (actId, unitId) => unitHost.runOn(actId, unitId)
			}
		},
		{
			subject: 'contract',
			heading: (t) => t.common.nav.contracts(),
			href: (match) => resolve(`/contracts/${match.id}`),
			find: (term) => useSearchContracts(term, MATCH_LIMIT),
			acts: {
				offered: (t, isAppleKeyboard) => toPaletteActs(contractActs, t, isAppleKeyboard),
				runOn: (actId, contractId) => contractHost.runOn(actId, contractId)
			}
		},
		{
			subject: 'payment',
			heading: (t) => t.common.nav.payments(),
			href: (match) => resolve(`/contracts/payments/${match.id}`),
			find: (term) => useSearchPayments(term, MATCH_LIMIT),
			acts: {
				offered: (t, isAppleKeyboard) => toPaletteActs(paymentActs, t, isAppleKeyboard),
				runOn: (actId, paymentId) => paymentHost.runOn(actId, paymentId)
			}
		},
		{
			subject: 'member',
			heading: (t) => t.organization.dashboard.membersTitle(),
			href: (match) =>
				`${resolve(withSection('organization'))}&${RECORD_PARAM}=${encodeURIComponent(match.id)}` as ResolvedPathname,
			find: organization.member.find,
			acts: { offered: organization.member.offered, runOn: organization.member.runOn }
		},
		{
			subject: 'workspace',
			heading: (t) => t.settings.section.workspaces(),
			href: (match) =>
				`${resolve(withSection('workspaces'))}&${WORKSPACE_PARAM}=${encodeURIComponent(match.id)}` as ResolvedPathname,
			find: organization.workspace.find,
			acts: { offered: organization.workspace.offered, runOn: organization.workspace.runOn }
		}
	];
}
