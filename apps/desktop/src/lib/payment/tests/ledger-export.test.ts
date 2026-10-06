import assert from 'node:assert/strict';
import test from 'node:test';

import { toExportSheet } from '@rentable/design/csv.js';
import { type Api, createApi, monthsFromNow, NOW } from '$lib/app/tests/testing.ts';
import type { Locales } from '$lib/i18n/i18n-types.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { readBack } from '$lib/transfer/tests/file.ts';
import {
	isWorkspaceImportable,
	planWorkspaceImport,
	toTransferInput
} from '$lib/transfer/index.ts';
import { paymentLedgerColumns } from '../ledger.ts';

/**
 * A LEDGER EXPORTED READS BACK WHOLE
 *
 * Effort 854, requirement 30: the ledger's own export follows the payments sheet, so a contract's
 * statement written out from either interface language and read back through the ledger's import
 * gives back every payment with its direction, method, reference and note. The contract is named
 * by the reference its own read answers with, so a contract with no government number reads back
 * too, even beside another of the same tenant from the same day.
 */

/** the one contract a ledger is a statement of, numbered, so its reference is its number. */
async function seedContract(api: Api) {
	const tenant = await api.tenant.create({
		name: 'Sara Idle',
		nationalId: '1334567892',
		phone: '+966554567890'
	});

	return api.contract.create({
		govId: 'GOV-2',
		tenantId: tenant.id,
		start: monthsFromNow(-2),
		end: monthsFromNow(10),
		interval: '12m',
		cost: 12_000
	});
}

/** a payment as a person entered it, without the ids and stamps a workspace gives it. */
function strip(
	payments: {
		date: number;
		amount: number;
		method?: string | null;
		reference?: string | null;
		note?: string | null;
		direction?: string | null;
	}[]
) {
	return payments
		.map(({ date, amount, method, reference, note, direction }) => ({
			date,
			amount,
			method,
			reference,
			note,
			direction
		}))
		.sort((a, b) => a.date - b.date);
}

for (const locale of ['en', 'ar'] satisfies Locales[]) {
	test(`a ledger exported in ${locale} reads back with every field of every payment`, async () => {
		loadLocale(locale);

		const source = await createApi();
		const contract = await seedContract(source);

		await source.payment.create({
			contractId: contract.id,
			date: monthsFromNow(-2),
			amount: 13_000,
			method: 'cheque',
			reference: 'CHQ-7'
		});
		await source.payment.create({
			contractId: contract.id,
			date: monthsFromNow(-1),
			amount: 1_000,
			direction: 'refund',
			method: 'bank-transfer',
			note: 'paid twice'
		});

		const ledger = await source.payment.getMany({ contractId: contract.id });

		// the same contract without its payments, which is what the ledger's import adds to.
		const target = await createApi();
		const copied = await seedContract(target);

		// a numbered contract is called by its number, as it always was.
		const { reference } = (await source.contract.get({ id: contract.id }))!;

		assert.equal(reference, 'GOV-2');

		const sheet = toExportSheet(
			paymentLedgerColumns(i18nObject(locale), reference, 'Sara Idle'),
			ledger
		);
		const plan = planWorkspaceImport(readBack([sheet]), NOW, await target.transfer.held({}), [
			'payments'
		]);

		assert.ok(isWorkspaceImportable(plan), 'the ledger it wrote is a ledger it can read');

		await target.transfer.importWhole(toTransferInput(plan.transfer));

		assert.deepEqual(strip(await target.payment.getMany({ contractId: copied.id })), strip(ledger));
	});
}

for (const locale of ['en', 'ar'] satisfies Locales[]) {
	test(`a ledger of a contract with no number, exported in ${locale}, reads back into its own workspace`, async () => {
		loadLocale(locale);

		const api = await createApi();
		const tenant = await api.tenant.create({
			name: 'Sara Idle',
			nationalId: '1334567892',
			phone: '+966554567890'
		});
		// two numberless contracts of one tenant from one day, so the ledger's contract is told
		// from the other only by the day its term ends.
		const contract = await api.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-2),
			end: monthsFromNow(10),
			interval: '12m',
			cost: 12_000
		});
		await api.contract.create({
			tenantId: tenant.id,
			start: monthsFromNow(-2),
			end: monthsFromNow(4),
			interval: '6m',
			cost: 6_000
		});

		const received = await api.payment.create({
			contractId: contract.id,
			date: monthsFromNow(-2),
			amount: 13_000,
			method: 'cheque',
			reference: 'CHQ-7'
		});
		const refund = await api.payment.create({
			contractId: contract.id,
			date: monthsFromNow(-1),
			amount: 1_000,
			direction: 'refund',
			method: 'bank-transfer',
			note: 'paid twice'
		});

		const ledger = await api.payment.getMany({ contractId: contract.id });
		// the contract as the ledger's page reads it, which is what names it in the file.
		const read = await api.contract.get({ id: contract.id });
		const sheet = toExportSheet(
			paymentLedgerColumns(i18nObject(locale), read!.reference, 'Sara Idle'),
			ledger
		);

		// the payments gone, so what the import gives back is only what the file carried.
		await api.payment.delete({ id: refund.id });
		await api.payment.delete({ id: received.id });

		const plan = planWorkspaceImport(readBack([sheet]), NOW, await api.transfer.held({}), [
			'payments'
		]);

		assert.ok(isWorkspaceImportable(plan), 'the ledger it wrote is a ledger it can read');

		await api.transfer.importWhole(toTransferInput(plan.transfer));

		assert.deepEqual(strip(await api.payment.getMany({ contractId: contract.id })), strip(ledger));
	});
}
