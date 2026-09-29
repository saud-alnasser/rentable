import { ContractSchema, type Contract } from '$lib/platform/database/schema';
import { formatDateInput, parseDateInput, toCalendarDate } from '$lib/date';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import type { ContractPrefill } from '$lib/contract/host.svelte';
import { getContractRenewalTerm } from '$lib/contract/renewal/renewal';
import { getContractCycleCount } from '$lib/contract/schedule/end-date';
import { isWholeHalalas } from '@rentable/design/money.js';
import { z } from 'zod';

/**
 * THE CONTRACT FORM, AS ONE DEFINITION
 *
 * What the contract form holds and the conversions in and out of it: the schema its fields are
 * validated by, the form a new contract, an edited one and a renewal each open on, and the payload
 * a submission sends. `contract/component/form.svelte` draws the form and owns its state; what is
 * here holds no state, so the fields it splits into read one definition of what they fill.
 *
 * **Built from the translations rather than at module load**, for the reason
 * `workspace/form.ts` gives: a refusal's sentence resolves against a locale, and at
 * module load there is none. The form builds it once, as it opens.
 */

/** the form's schema, its refusals worded in the locale the form opened in. */
export function contractFormSchema(t: TranslationFunctions) {
	return z.object({
		id: z.string().optional(),
		govId: z.string().trim().optional().default(''),
		tenantId: z.string().min(1, t.contracts.form.tenantRequired()),
		interval: ContractSchema.shape.interval,
		cost: z
			.string()
			.trim()
			.min(1, t.contracts.form.costRequired())
			.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
				message: t.contracts.form.costGreaterThanZero()
			})
			.refine(isWholeHalalas, {
				message: t.contracts.form.costDecimalPlaces()
			}),
		cycles: z
			.string()
			.trim()
			.min(1, t.contracts.form.cyclesRequired())
			.refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, {
				message: t.contracts.form.cyclesGreaterThanZero()
			}),
		start: z.string().min(1, t.contracts.form.startDateRequired()),
		end: z.string().min(1, t.contracts.form.endDateRequired()),
		// the units a new contract is created holding. Only creation offers them: an edit and a
		// renewal leave the units where the tab and the predecessor put them.
		unitIds: z.array(z.string()).default([])
	});
}

export type ContractForm = z.infer<ReturnType<typeof contractFormSchema>>;

/**
 * the contract being edited, or the details a new one starts from when duplicating, which is the
 * same shape without an identity, because everything else transfers.
 */
export type ContractFormContract = Omit<Contract, 'id'> & { id?: string };

/** The form a new contract opens on, holding what whoever opened it already knew. */
export const toInitialForm = (prefill: ContractPrefill | undefined): ContractForm => ({
	id: undefined,
	govId: '',
	tenantId: prefill?.tenantId ?? '',
	interval: '1m',
	cost: '',
	cycles: '1',
	start: '',
	end: '',
	unitIds: [...(prefill?.unitIds ?? [])]
});

/** The form an edit or a duplicate opens on: the contract as it stands. */
export const toFormValue = (contract: ContractFormContract): ContractForm => ({
	id: contract.id,
	govId: contract.govId ?? '',
	tenantId: contract.tenantId.toString(),
	interval: contract.interval,
	cost: contract.cost.toString(),
	cycles: getContractCycleCount(
		toCalendarDate(contract.start),
		toCalendarDate(contract.end),
		contract.interval
	),
	start: formatDateInput(contract.start),
	end: formatDateInput(contract.end),
	unitIds: []
});

/**
 * The successor a renewal starts from: the predecessor's tenant, cycle and cost, over the
 * term the domain proposes. Only that term is the user's to move, so the fields carrying the
 * other three are shown and locked rather than left out — a renewal that quietly dropped the
 * cost off the surface would be asking the reader to trust a figure they cannot see.
 */
export const toRenewalFormValue = (
	contract: Pick<Contract, 'tenantId' | 'interval' | 'cost' | 'start' | 'end'>
): ContractForm => {
	const term = getContractRenewalTerm(contract);

	return {
		id: undefined,
		// a government id is unique to one contract, so the successor starts without the
		// predecessor's rather than with a value that cannot be saved.
		govId: '',
		tenantId: contract.tenantId.toString(),
		interval: contract.interval,
		cost: contract.cost.toString(),
		cycles: String(term.cycles),
		start: formatDateInput(term.start),
		end: formatDateInput(term.end),
		unitIds: []
	};
};

/** What a submission sends: the term in order, and the fields as the procedures take them. */
export const toPayload = (form: ContractForm) => ({
	...(() => {
		const start = parseDateInput(form.start);
		const end = parseDateInput(form.end);

		if (start <= end) {
			return { start, end };
		}

		return { start: end, end: start };
	})(),
	govId: form.govId || undefined,
	tenantId: form.tenantId,
	interval: form.interval,
	cost: Number(form.cost)
});
