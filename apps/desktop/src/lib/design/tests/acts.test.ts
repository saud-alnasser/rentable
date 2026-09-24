import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { ContractSchema } from '$lib/platform/database/schema.ts';

/**
 * Requirement 8 of effort 832, criterion 8: a record's acts are declared once, and the card's menu
 * (its context menu reads the same list), the record's page and the command menu are projections
 * of that one declaration. So for a record in every state it can be in, the three projections
 * offer the same acts, under the same names, with the same glyphs, in the same order.
 *
 * The glyphs are Svelte components, which this runner cannot load, so each is stood in for by a
 * value of its own: what is compared is *which* glyph each surface draws, and that survives the
 * substitution exactly.
 */
const GLYPHS = ['ban', 'calendar-plus', 'copy', 'files', 'rotate-ccw', 'square-pen', 'trash-2'];

for (const glyph of GLYPHS) {
	mock.module(`@lucide/svelte/icons/${glyph}`, {
		defaultExport: Object.assign(() => {}, { glyph })
	});
}

const { toCardActions, toPageActions, toPaletteActs, toPaletteVerbs } =
	await import('$lib/design/acts');
const { declareContractActs } = await import('$lib/contract/acts');
type ContractActRecord = import('$lib/contract/acts').ContractActRecord;
type ContractConfirmation = import('$lib/contract/acts').ContractConfirmation;

loadLocale('en');

const translations = i18nObject('en');

/** A host that records what each act asked of it, in place of the one the frame mounts. */
function recordingHost() {
	const asked: string[] = [];
	const note = (request: string) => (contract: ContractActRecord) =>
		asked.push(`${request}:${contract.id}`);

	return {
		asked,
		host: {
			copyDetails: note('copyDetails'),
			duplicate: note('duplicate'),
			renew: note('renew'),
			edit: note('edit'),
			confirm: (kind: ContractConfirmation, contract: ContractActRecord) =>
				asked.push(`confirm.${kind}:${contract.id}`)
		}
	};
}

/** A contract in one status, as the directory's read hands it to a card. */
function contractIn(status: ContractActRecord['status']): ContractActRecord {
	return {
		id: `contract-${status}`,
		govId: '4471',
		status,
		start: Date.UTC(2026, 0, 1),
		end: Date.UTC(2026, 11, 31),
		interval: '1m',
		cost: 1500,
		paidAmount: 0,
		expectedAmount: 18000,
		tenantId: 'tenant-1',
		tenantName: 'Noura'
	};
}

const STATUSES = ContractSchema.shape.status.options;

type Offered = { id: string | undefined; label: string; icon: unknown };

/** what a projection offers, reduced to what the criterion compares. */
const reduce = (entries: Offered[]) =>
	entries.map(({ id, label, icon }) => ({ id, label, icon: (icon as { glyph?: string }).glyph }));

for (const status of STATUSES) {
	test(`a contract that is ${status} is offered the same acts on its card, its page and in the palette`, () => {
		const acts = declareContractActs(recordingHost().host);
		const contract = contractIn(status);

		const card = reduce(
			toCardActions(acts, contract, translations).map((action) => ({
				id: action.attributes?.['data-act'],
				label: action.label,
				icon: action.icon
			}))
		);
		const page = reduce(toPageActions(acts, contract, translations));
		const palette = reduce(toPaletteVerbs(acts, contract, translations, false));

		assert.ok(card.length > 0, 'every contract is offered something');
		// the stand-ins reached the projections, so the glyphs compared below are real answers.
		assert.ok(
			card.every((entry) => GLYPHS.includes(entry.icon ?? '')),
			'every entry carries its glyph'
		);
		assert.deepEqual(page, card);
		assert.deepEqual(palette, card);
	});
}

test('the acts are offered in the declared order, and only those the status admits', () => {
	const acts = declareContractActs(recordingHost().host);
	const idsFor = (status: ContractActRecord['status']) =>
		toPageActions(acts, contractIn(status), translations).map((act) => act.id);

	assert.deepEqual(idsFor('active'), [
		'contract.copyDetails',
		'contract.duplicate',
		'contract.renew',
		'contract.edit',
		'contract.terminate',
		'contract.delete'
	]);
	// a terminated contract is not edited or terminated again; it is restored.
	assert.deepEqual(idsFor('terminated'), [
		'contract.copyDetails',
		'contract.duplicate',
		'contract.renew',
		'contract.restore',
		'contract.delete'
	]);
	// the domain's own rule: a contract that has not started is not terminated.
	assert.deepEqual(idsFor('scheduled'), [
		'contract.copyDetails',
		'contract.duplicate',
		'contract.renew',
		'contract.edit',
		'contract.delete'
	]);
});

test('the tones, groups and shortcuts are the same on the card as on the page', () => {
	const acts = declareContractActs(recordingHost().host);
	const contract = contractIn('active');

	assert.deepEqual(
		toCardActions(acts, contract, translations).map(({ tone, group, shortcut }) => ({
			tone,
			group,
			shortcut
		})),
		toPageActions(acts, contract, translations).map(({ tone, group, shortcut }) => ({
			tone,
			group,
			shortcut
		}))
	);
});

test('the destructive group comes last', () => {
	const acts = declareContractActs(recordingHost().host);
	const groups = acts.map((act) => act.group);

	assert.equal(groups.at(-1), 'destructive');
	assert.equal(groups.indexOf('destructive'), groups.length - 1);
});

test('before a record is chosen, the palette offers every act the contract declares, in order', () => {
	const acts = declareContractActs(recordingHost().host);

	assert.deepEqual(
		toPaletteActs(acts, translations, false).map((act) => act.id),
		acts.map((act) => act.id)
	);
});

test('every surface runs an act by asking the host, on the record it was offered for', () => {
	const { asked, host } = recordingHost();
	const acts = declareContractActs(host);
	const contract = contractIn('active');

	toCardActions(acts, contract, translations)
		.find((action) => action.attributes?.['data-act'] === 'contract.terminate')
		?.onSelect();
	toPageActions(acts, contract, translations)
		.find((act) => act.id === 'contract.renew')
		?.run();
	toPaletteVerbs(acts, contract, translations, false)
		.find((act) => act.id === 'contract.duplicate')
		?.run();

	assert.deepEqual(asked, [
		'confirm.terminate:contract-active',
		'renew:contract-active',
		'duplicate:contract-active'
	]);
});

/*
 * The other record concepts: tenant, complex, unit and payment. Each declares its acts the way the
 * contract does, and each is held to the same agreement: for a record in every state it can be in,
 * the card, the page and the command menu offer the same acts, under the same names, with the same
 * glyphs, in the same order.
 */

const { declareTenantActs } = await import('$lib/tenant/acts');
const { declareComplexActs } = await import('$lib/complex/acts');
const { declareUnitActs } = await import('$lib/complex/unit/acts');
const { declarePaymentActs } = await import('$lib/payment/acts');
const { UnitSchema } = await import('$lib/platform/database/schema.ts');

type RecordActs<T> = import('$lib/design/acts').RecordAct<T>[];

/** A host that records which request each act raised, and on which record. */
function recordingRequests<K extends string>(requests: readonly K[]) {
	const asked: string[] = [];
	const host = {} as Record<K, (record: { id: string }) => void>;

	for (const request of requests) {
		host[request] = (record) => {
			asked.push(`${request}:${record.id}`);
		};
	}

	return { asked, host };
}

/** Assert the card, the page and the palette agree on one record, and return the ids offered. */
function assertProjectionsAgree<T>(acts: RecordActs<T>, record: T) {
	const card = reduce(
		toCardActions(acts, record, translations).map((action) => ({
			id: action.attributes?.['data-act'],
			label: action.label,
			icon: action.icon
		}))
	);
	const page = reduce(toPageActions(acts, record, translations));
	const palette = reduce(toPaletteVerbs(acts, record, translations, false));

	assert.ok(card.length > 0, 'every record is offered something');
	assert.ok(
		card.every((entry) => GLYPHS.includes(entry.icon ?? '')),
		'every entry carries its glyph'
	);
	assert.deepEqual(page, card);
	assert.deepEqual(palette, card);
	assert.deepEqual(
		toCardActions(acts, record, translations).map(({ tone, group, shortcut }) => ({
			tone,
			group,
			shortcut
		})),
		toPageActions(acts, record, translations).map(({ tone, group, shortcut }) => ({
			tone,
			group,
			shortcut
		}))
	);

	return page.map((entry) => entry.id);
}

/** The declaration's own invariants: destructive last, and the palette offers every act in order. */
function assertDeclarationHolds<T>(acts: RecordActs<T>) {
	const groups = acts.map((act) => act.group);

	assert.equal(groups.at(-1), 'destructive');
	assert.equal(groups.indexOf('destructive'), groups.length - 1);
	assert.deepEqual(
		toPaletteActs(acts, translations, false).map((act) => act.id),
		acts.map((act) => act.id)
	);
}

const TENANT = { id: 'tenant-1', name: 'Noura', nationalId: '1000000001', phone: '+966500000001' };

test('a tenant is offered copy details, edit and delete alike on its card, its page and in the palette', () => {
	const { asked, host } = recordingRequests(['copyDetails', 'edit', 'confirmDelete'] as const);
	const acts = declareTenantActs(host);

	assert.deepEqual(assertProjectionsAgree(acts, TENANT), [
		'tenant.copyDetails',
		'tenant.edit',
		'tenant.delete'
	]);
	assertDeclarationHolds(acts);

	toCardActions(acts, TENANT, translations)
		.find((action) => action.attributes?.['data-act'] === 'tenant.delete')
		?.onSelect();
	toPageActions(acts, TENANT, translations)
		.find((act) => act.id === 'tenant.copyDetails')
		?.run();

	assert.deepEqual(asked, ['confirmDelete:tenant-1', 'copyDetails:tenant-1']);
});

const COMPLEX = { id: 'complex-1', name: 'Al Nakheel', location: 'Riyadh' };

test('a complex is offered copy details, edit and delete alike on its card, its page and in the palette', () => {
	const { asked, host } = recordingRequests(['copyDetails', 'edit', 'confirmDelete'] as const);
	const acts = declareComplexActs(host);

	assert.deepEqual(assertProjectionsAgree(acts, COMPLEX), [
		'complex.copyDetails',
		'complex.edit',
		'complex.delete'
	]);
	assertDeclarationHolds(acts);

	toPaletteVerbs(acts, COMPLEX, translations, false)
		.find((act) => act.id === 'complex.edit')
		?.run();

	assert.deepEqual(asked, ['edit:complex-1']);
});

for (const status of UnitSchema.shape.status.options) {
	test(`a unit that is ${status} is offered edit and delete on its page as on its card`, () => {
		const { asked, host } = recordingRequests(['copyDetails', 'edit', 'confirmDelete'] as const);
		const acts = declareUnitActs(host);
		const unit = { id: `unit-${status}`, name: 'A1', complexId: 'complex-1', status };

		// requirement 14: a unit's page offers the acts its card offers, edit and delete included.
		assert.deepEqual(assertProjectionsAgree(acts, unit), [
			'unit.copyDetails',
			'unit.edit',
			'unit.delete'
		]);
		assertDeclarationHolds(acts);

		toPageActions(acts, unit, translations)
			.find((act) => act.id === 'unit.edit')
			?.run();
		toPageActions(acts, unit, translations)
			.find((act) => act.id === 'unit.delete')
			?.run();

		assert.deepEqual(asked, [`edit:unit-${status}`, `confirmDelete:unit-${status}`]);
	});
}

/** A payment against a contract in one status, or one whose contract has not been read yet. */
function paymentAgainst(contractStatus: ContractActRecord['status'] | undefined) {
	return {
		id: `payment-${contractStatus ?? 'unread'}`,
		date: Date.UTC(2026, 2, 1),
		amount: 1500,
		contractId: 'contract-1',
		contractStatus
	};
}

for (const status of [...STATUSES, undefined]) {
	test(`a payment against a contract that is ${status ?? 'not read yet'} is offered the same acts on its card, its page and in the palette`, () => {
		const { host } = recordingRequests([
			'copyDetails',
			'duplicate',
			'edit',
			'confirmDelete'
		] as const);
		const acts = declarePaymentActs(host);
		const ids = assertProjectionsAgree(acts, paymentAgainst(status));

		// a terminated contract's statement is read-only: copying is a read and stays.
		assert.deepEqual(
			ids,
			status === 'terminated'
				? ['payment.copyDetails']
				: ['payment.copyDetails', 'payment.duplicate', 'payment.edit', 'payment.delete']
		);
		assertDeclarationHolds(acts);
	});
}
