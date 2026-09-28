import type { UnitPrefill } from '$lib/complex/unit/host.svelte';
import type { PaymentPrefill } from '$lib/payment/host.svelte';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { RecordSubject } from '$lib/layout/palette';
import type { RecordFlag } from '$lib/workspace/permission';

/**
 * THE COMMAND MENU'S CREATE GROUP
 *
 * Every concept a person can create, as the command menu offers it (effort 832, requirement 9):
 * tenants, complexes, units, contracts and payments. Each entry reaches the concept host's
 * `create`, one of two ways, and which is the concept's own shape rather than a choice made here:
 *
 * - **a concept that stands on its own** (tenant, complex, contract) goes to its directory with
 *   `?create`, so the record is made where it will be listed. The host consumes the intent there
 *   and opens its form.
 * - **a concept that cannot be without another record** (a unit without its complex, a payment
 *   without its contract) asks for that record first, through the command menu's asking mode, the
 *   way a record's act asks for the record it runs on. The host is then asked with it.
 *
 * Declared as a function of the two hosts it asks, rather than bound to them here, so the list can
 * be read and run under Node with stand-ins.
 *
 * **Each entry names the flags it needs** (effort 838, requirement 10): the create its procedure
 * names, and, for an entry that asks for a record first, viewing the kind it asks for, since a
 * reader who cannot see a complex cannot choose the one a unit goes in. The command menu offers
 * only the entries the reader holds every flag of ({@link toOfferedCreates}).
 */

/** A directory a record is created in by address. */
export type CreateDirectory = '/tenants' | '/complexes' | '/contracts';

/** One entry of the create group. */
export type PaletteCreate = {
	/** what is created. */
	subject: RecordSubject;
	/** its name, in the reader's language. */
	label: (translations: TranslationFunctions) => string;
	/** what the reader needs, every one of them, for the command menu to offer it. */
	flags: readonly RecordFlag[];
} & (
	| {
			kind: 'directory';
			/** the directory it is created in, which the host answers `?create` on. */
			directory: CreateDirectory;
	  }
	| {
			kind: 'asks';
			/** the record a new one cannot be without, asked for before the form opens. */
			asks: RecordSubject;
			/** ask the host, with the record the reader chose. */
			create: (recordId: string) => void;
	  }
);

/** The hosts the create group asks directly, each with the record it cannot be without. */
export type CreateHosts = {
	unit: (prefill: UnitPrefill) => void;
	payment: (prefill: PaymentPrefill) => void;
};

/** The create group, in the order the command menu offers it: the order records are searched. */
export function declarePaletteCreates(hosts: CreateHosts): PaletteCreate[] {
	return [
		{
			subject: 'tenant',
			label: (t) => t.common.labels.tenant(),
			flags: ['createTenant'],
			kind: 'directory',
			directory: '/tenants'
		},
		{
			subject: 'complex',
			label: (t) => t.common.labels.complex(),
			flags: ['createComplex'],
			kind: 'directory',
			directory: '/complexes'
		},
		{
			subject: 'unit',
			label: (t) => t.common.labels.unit(),
			flags: ['createUnit', 'viewComplex'],
			kind: 'asks',
			asks: 'complex',
			create: (complexId) => hosts.unit({ complexId })
		},
		{
			subject: 'contract',
			label: (t) => t.common.labels.contract(),
			flags: ['createContract'],
			kind: 'directory',
			directory: '/contracts'
		},
		{
			subject: 'payment',
			label: (t) => t.common.labels.payment(),
			flags: ['createPayment', 'viewContract'],
			kind: 'asks',
			asks: 'contract',
			create: (contractId) => hosts.payment({ contractId })
		}
	];
}

/**
 * The entries of the create group the reader may use: those whose every flag they hold. An entry
 * they may not use is left out rather than refused, as a record's act they lack is
 * (`toPaletteActs`), since the menu is searched by name and a row that can never run would answer
 * every search for it.
 */
export function toOfferedCreates(
	creates: readonly PaletteCreate[],
	refusal: (flags: readonly RecordFlag[]) => string | undefined
): PaletteCreate[] {
	return creates.filter((create) => refusal(create.flags) === undefined);
}
