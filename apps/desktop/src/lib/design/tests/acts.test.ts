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
