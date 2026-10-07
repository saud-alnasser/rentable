import assert from 'node:assert/strict';
import test from 'node:test';

import {
	contractFormSchema,
	toInitialForm,
	toPayload,
	type ContractForm
} from '$lib/contract/form.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

/**
 * THE CONTRACT FORM, FILLED IN ARABIC-INDIC DIGITS
 *
 * Criterion 21 of effort 854: a cost typed in Arabic-Indic digits, with `٫` as its decimal point,
 * is read as the Western figure it stands for, never refused as malformed. The number of cycles
 * is the same shape of field and reads the same way.
 */

loadLocale('en');

const schema = contractFormSchema(i18nObject('en'));

/** a new contract with every field the schema requires filled, and the cost and cycles given. */
const filled = (cost: string, cycles = '12'): ContractForm => ({
	...toInitialForm(undefined),
	tenantId: 'tenant-1',
	cost,
	cycles,
	start: '2026-01-01',
	end: '2026-12-31'
});

test('a cost in arabic-indic digits passes and is sent as its western figure', () => {
	const parsed = schema.safeParse(filled('٤١٦٦'));

	assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
	assert.equal(toPayload(parsed.data).cost, 4166);
});

test('a cost with the arabic decimal separator passes and is sent as its western figure', () => {
	const parsed = schema.safeParse(filled('٤١٦٦٫٦٧'));

	assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
	assert.equal(toPayload(parsed.data).cost, 4166.67);
});

test('a cost in arabic-indic digits is still held to whole halalas', () => {
	const parsed = schema.safeParse(filled('١٠٫٠٠١'));

	assert.equal(parsed.success, false);
});

test('a number of cycles in arabic-indic digits passes', () => {
	const parsed = schema.safeParse(filled('1500', '١٢'));

	assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});
