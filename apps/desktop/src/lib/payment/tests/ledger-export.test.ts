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
 * gives back every payment with its direction, method, reference and note.
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

		const sheet = toExportSheet(
			paymentLedgerColumns(i18nObject(locale), 'GOV-2', 'Sara Idle'),
			ledger
		);
		const plan = planWorkspaceImport(readBack([sheet]), NOW, await target.transfer.held({}), [
			'payments'
		]);

		assert.ok(isWorkspaceImportable(plan), 'the ledger it wrote is a ledger it can read');

		await target.transfer.importWhole(toTransferInput(plan.transfer));

		const strip = (payments: typeof ledger) =>
			payments
				.map(({ date, amount, method, reference, note, direction }) => ({
					date,
					amount,
					method,
					reference,
					note,
					direction
				}))
				.sort((a, b) => a.date - b.date);

		assert.deepEqual(strip(await target.payment.getMany({ contractId: copied.id })), strip(ledger));
	});
}
