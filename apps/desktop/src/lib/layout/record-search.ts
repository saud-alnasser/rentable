import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import type { RecordMatch } from '$lib/api/search';
import { useSearchComplexes, useSearchUnits } from '$lib/complex/query';
import { useSearchContracts } from '$lib/contract/query';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { RecordSubject } from '$lib/layout/palette';
import { useSearchPayments } from '$lib/payment/query';
import { useSearchTenants } from '$lib/tenant/query';
import type { CreateQueryResult } from '@tanstack/svelte-query';

/**
 * RECORD SEARCH
 *
 * which concepts the palette offers records of, what each group is called, and where opening
 * one goes. The searching itself belongs to each concept — this is the shell's table of what
 * it presents and in what order, which is the shell's own question.
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
	/** the concept's own search, bound to the term the palette is holding. */
	find: (term: () => string) => CreateQueryResult<RecordMatch[], Error>;
};

/** The concepts the palette searches, in the order it presents them. */
export const recordConcepts: RecordConcept[] = [
	{
		subject: 'tenant',
		heading: (t) => t.common.nav.tenants(),
		href: (match) => resolve(`/tenants/${match.id}`),
		find: (term) => useSearchTenants(term, MATCH_LIMIT)
	},
	{
		subject: 'complex',
		heading: (t) => t.common.nav.complexes(),
		href: (match) => resolve(`/complexes/${match.id}`),
		find: (term) => useSearchComplexes(term, MATCH_LIMIT)
	},
	{
		subject: 'unit',
		heading: (t) => t.common.nav.units(),
		href: (match) => resolve(`/complexes/units/${match.id}`),
		find: (term) => useSearchUnits(term, MATCH_LIMIT)
	},
	{
		subject: 'contract',
		heading: (t) => t.common.nav.contracts(),
		href: (match) => resolve(`/contracts/${match.id}`),
		find: (term) => useSearchContracts(term, MATCH_LIMIT)
	},
	{
		subject: 'payment',
		heading: (t) => t.common.nav.payments(),
		href: (match) => resolve(`/contracts/payments/${match.id}`),
		find: (term) => useSearchPayments(term, MATCH_LIMIT)
	}
];
