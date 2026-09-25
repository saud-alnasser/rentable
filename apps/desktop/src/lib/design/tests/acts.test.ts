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
const GLYPHS = [
	'ban',
	'calendar-plus',
	'copy',
	'file-plus',
	'files',
	'message-circle',
	'rotate-ccw',
	'square-pen',
	'trash-2'
];

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
			remind: note('remind'),
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

// criterion 12(c) of effort 835: the reminder is offered on the three ranks that owe or fall due,
// on the card, the page and in the palette alike, and on no contract in another rank or in none.
test('the reminder is offered on an overdue, owing or due-soon contract, and on no other', () => {
	const acts = declareContractActs(recordingHost().host);
	const offersReminder = (contract: ContractActRecord) => {
		const page = toPageActions(acts, contract, translations).some(
			(act) => act.id === 'contract.remind'
		);

		assert.equal(
			toCardActions(acts, contract, translations).some(
				(action) => action.attributes?.['data-act'] === 'contract.remind'
			),
			page
		);
		assert.equal(
			toPaletteVerbs(acts, contract, translations, false).some(
				(act) => act.id === 'contract.remind'
			),
			page
		);

		return page;
	};

	for (const rank of ['overdue', 'owing', 'due-soon'] as const) {
		assert.equal(offersReminder({ ...contractIn('active'), rank }), true, rank);
	}

	assert.equal(offersReminder({ ...contractIn('active'), rank: 'ending-soon' }), false);
	// in no rank: the read left the rank off.
	assert.equal(offersReminder(contractIn('active')), false);
	// terminated: no rank admits one, and the act is not offered even on a stale rank.
	assert.equal(offersReminder(contractIn('terminated')), false);
	assert.equal(offersReminder({ ...contractIn('terminated'), rank: 'overdue' }), false);
});

test('the reminder sits after renew, and asks the host to remind on the record it was offered for', () => {
	const { asked, host } = recordingHost();
	const acts = declareContractActs(host);
	const contract: ContractActRecord = { ...contractIn('active'), rank: 'owing' };

	assert.deepEqual(
		toPageActions(acts, contract, translations).map((act) => act.id),
		[
			'contract.copyDetails',
			'contract.duplicate',
			'contract.renew',
			'contract.remind',
			'contract.edit',
			'contract.terminate',
			'contract.delete'
		]
	);

	toPageActions(acts, contract, translations)
		.find((act) => act.id === 'contract.remind')
		?.run();

	assert.deepEqual(asked, ['remind:contract-active']);
});

test('a reminder to a tenant known to have no phone is shown and refused, with the reason', () => {
	const acts = declareContractActs(recordingHost().host);
	const reminder = (contract: ContractActRecord) =>
		toPageActions(acts, contract, translations).find((act) => act.id === 'contract.remind');

	assert.equal(
		reminder({ ...contractIn('active'), rank: 'owing', tenantPhone: '' })?.unavailable,
		translations.contracts.reminder.noPhone()
	);
	// a read that does not carry the phone does not refuse on it: the host reads the tenant.
	assert.equal(reminder({ ...contractIn('active'), rank: 'owing' })?.unavailable, undefined);
	assert.equal(
		reminder({ ...contractIn('active'), rank: 'owing', tenantPhone: '+966551234567' })?.unavailable,
		undefined
	);
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
const { declarePaymentActs, toPaymentCreateUnavailable } = await import('$lib/payment/acts');
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

test('a tenant is offered copy details, edit, new contract and delete alike on its card, its page and in the palette', () => {
	const { asked, host } = recordingRequests([
		'copyDetails',
		'edit',
		'newContract',
		'confirmDelete'
	] as const);
	const acts = declareTenantActs(host);

	assert.deepEqual(assertProjectionsAgree(acts, TENANT), [
		'tenant.copyDetails',
		'tenant.edit',
		'tenant.newContract',
		'tenant.delete'
	]);
	assertDeclarationHolds(acts);

	toCardActions(acts, TENANT, translations)
		.find((action) => action.attributes?.['data-act'] === 'tenant.delete')
		?.onSelect();
	toPageActions(acts, TENANT, translations)
		.find((act) => act.id === 'tenant.copyDetails')
		?.run();
	// requirement 21: a contract is started from the tenant's page, on that tenant.
	toPageActions(acts, TENANT, translations)
		.find((act) => act.id === 'tenant.newContract')
		?.run();

	assert.deepEqual(asked, [
		'confirmDelete:tenant-1',
		'copyDetails:tenant-1',
		'newContract:tenant-1'
	]);
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
	test(`a unit that is ${status} is offered edit, new contract and delete on its page as on its card`, () => {
		const { asked, host } = recordingRequests([
			'copyDetails',
			'edit',
			'newContract',
			'confirmDelete'
		] as const);
		const acts = declareUnitActs(host);
		const unit = { id: `unit-${status}`, name: 'A1', complexId: 'complex-1', status };

		// requirement 14: a unit's page offers the acts its card offers, edit and delete included.
		assert.deepEqual(assertProjectionsAgree(acts, unit), [
			'unit.copyDetails',
			'unit.edit',
			'unit.newContract',
			'unit.delete'
		]);
		assertDeclarationHolds(acts);

		toPageActions(acts, unit, translations)
			.find((act) => act.id === 'unit.edit')
			?.run();
		toPageActions(acts, unit, translations)
			.find((act) => act.id === 'unit.delete')
			?.run();
		// requirement 21: a contract is started from the unit's page, whatever the unit's status.
		toPageActions(acts, unit, translations)
			.find((act) => act.id === 'unit.newContract')
			?.run();

		assert.deepEqual(asked, [
			`edit:unit-${status}`,
			`confirmDelete:unit-${status}`,
			`newContract:unit-${status}`
		]);
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

		// every act applies to a payment, whatever its contract.
		assert.deepEqual(ids, [
			'payment.copyDetails',
			'payment.duplicate',
			'payment.edit',
			'payment.delete'
		]);

		// a terminated contract's statement is read-only: copying is a read and runs, and what writes
		// is shown refused with the contract's state as its reason (ticket 33).
		const refused = toPageActions(acts, paymentAgainst(status), translations)
			.filter((act) => act.unavailable)
			.map((act) => [act.id, act.unavailable]);

		assert.deepEqual(
			refused,
			status === 'terminated'
				? ['payment.duplicate', 'payment.edit', 'payment.delete'].map((id) => [
						id,
						translations.contracts.payments.terminatedNotice()
					])
				: []
		);
		assertDeclarationHolds(acts);
	});
}

/**
 * The members and workspaces directories in settings, held to the same criterion (effort 832,
 * ticket 11). What a member or a workspace admits is read off the reader as much as the record,
 * so the states a record is in here are the readers it can be read by: the owner, an
 * administrator, a member widened by one act, and a member holding none, on each kind of card.
 */
const ORGANIZATION_GLYPHS = [
	'crown',
	'laptop',
	'link',
	'lock',
	'refresh-cw',
	'square-pen',
	'trash-2',
	'user-minus',
	'users'
];

// a glyph the contract's acts already stood in for is not stood in for twice.
for (const glyph of ORGANIZATION_GLYPHS.filter((declared) => !GLYPHS.includes(declared))) {
	mock.module(`@lucide/svelte/icons/${glyph}`, {
		defaultExport: Object.assign(() => {}, { glyph })
	});
}

const { declareMemberActs, declareWorkspaceActs } = await import('$lib/organization/acts');
type MemberActRecord = import('$lib/organization/acts').MemberActRecord;
type MemberActContext = import('$lib/organization/acts').MemberActContext;
type WorkspaceActRecord = import('$lib/organization/acts').WorkspaceActRecord;
type WorkspaceActContext = import('$lib/organization/acts').WorkspaceActContext;
type OrganizationMember = import('$lib/platform/host').OrganizationMember;
type OrganizationWorkspace = import('$lib/platform/host').OrganizationWorkspace;

/** A host that records what each member or workspace act asked of it. */
function recordingOrganizationHost() {
	const asked: string[] = [];
	const onMember = (request: string) => (record: MemberActRecord) =>
		asked.push(`${request}:${record.member.id}`);
	const onWorkspace = (request: string) => (record: WorkspaceActRecord) =>
		asked.push(`${request}:${record.workspace.id}`);

	return {
		asked,
		member: {
			edit: onMember('edit'),
			offerOwnership: onMember('offerOwnership'),
			withdrawOffer: onMember('withdrawOffer'),
			makeLink: onMember('makeLink'),
			unsetPassword: onMember('unsetPassword'),
			endSessions: onMember('endSessions'),
			confirmRemoval: (record: MemberActRecord, lockOut: boolean) =>
				asked.push(`${lockOut ? 'confirm.lockOut' : 'confirm.remove'}:${record.member.id}`)
		},
		workspace: {
			edit: onWorkspace('edit'),
			changeAccess: onWorkspace('changeAccess'),
			confirmDelete: onWorkspace('confirmDelete')
		}
	};
}

const memberOf = (id: string, role: OrganizationMember['role']): OrganizationMember => ({
	id,
	username: id,
	role,
	permissions: 0,
	workspaces: [],
	createdAt: 0,
	offeredOwnership: false
});

const NONE_HELD = {
	canInvite: false,
	canReset: false,
	canRemove: false,
	canLockOut: false,
	canRename: false,
	canChangeRole: false,
	canGrantWorkspace: false
};

const EVERY_HELD = {
	canInvite: true,
	canReset: true,
	canRemove: true,
	canLockOut: true,
	canRename: true,
	canChangeRole: true,
	canGrantWorkspace: true
};

const IDLE = {
	linking: false,
	unsetting: false,
	endingSessions: false,
	offering: false,
	withdrawing: false
};

/** the readers a member's card is read by, each in the organization olivia owns. */
const MEMBER_READERS: Record<string, MemberActContext> = {
	owner: {
		selfId: 'olivia',
		isOwner: true,
		...EVERY_HELD,
		offerStands: false,
		offerable: [{ id: 'ada', username: 'ada' }],
		pending: IDLE
	},
	'owner with an offer standing': {
		selfId: 'olivia',
		isOwner: true,
		...EVERY_HELD,
		offerStands: true,
		offerable: [{ id: 'ada', username: 'ada' }],
		pending: IDLE
	},
	administrator: {
		selfId: 'ada',
		isOwner: false,
		...EVERY_HELD,
		canLockOut: false,
		offerStands: false,
		offerable: [],
		pending: IDLE
	},
	'member widened by renameMember': {
		selfId: 'sami',
		isOwner: false,
		...NONE_HELD,
		canRename: true,
		offerStands: false,
		offerable: [],
		pending: IDLE
	},
	'member holding nothing': {
		selfId: 'sami',
		isOwner: false,
		...NONE_HELD,
		offerStands: false,
		offerable: [],
		pending: IDLE
	}
};

const MEMBERS = [
	memberOf('olivia', 'owner'),
	memberOf('ada', 'administrator'),
	memberOf('sami', 'member')
];

for (const [reader, context] of Object.entries(MEMBER_READERS)) {
	for (const member of MEMBERS) {
		test(`the card of ${member.id}, read by the ${reader}, offers the same acts on the card, the page and the palette`, () => {
			const acts = declareMemberActs(recordingOrganizationHost().member);
			const record = { member, context };

			const card = reduce(
				toCardActions(acts, record, translations).map((action) => ({
					id: action.attributes?.['data-act'],
					label: action.label,
					icon: action.icon
				}))
			);
			const page = reduce(toPageActions(acts, record, translations));
			const palette = reduce(toPaletteVerbs(acts, record, translations, false));

			assert.ok(
				card.every((entry) => ORGANIZATION_GLYPHS.includes(entry.icon ?? '')),
				'every entry carries its glyph'
			);
			assert.deepEqual(page, card);
			assert.deepEqual(palette, card);
		});
	}
}

test('a member is offered one edit, never a rename beside it, under the edit glyph', () => {
	const acts = declareMemberActs(recordingOrganizationHost().member);
	const idsFor = (member: OrganizationMember, context: MemberActContext) =>
		toCardActions(acts, { member, context }, translations).map(
			(action) => action.attributes?.['data-act']
		);

	// the owner reading anybody else's card: every act, in the declared order.
	assert.deepEqual(idsFor(memberOf('ada', 'administrator'), MEMBER_READERS.owner), [
		'member.edit',
		'member.makeLink',
		'member.unsetPassword',
		'member.endSessions',
		'member.remove',
		'member.lockOut'
	]);
	// their own card: the handover, and while an offer stands its withdrawal in its place.
	assert.deepEqual(idsFor(memberOf('olivia', 'owner'), MEMBER_READERS.owner), [
		'member.offerOwnership'
	]);
	assert.deepEqual(
		idsFor(memberOf('olivia', 'owner'), MEMBER_READERS['owner with an offer standing']),
		['member.withdrawOffer']
	);
	// an administrator meets nothing on the owner's card or their own, and no lock-out anywhere.
	assert.deepEqual(idsFor(memberOf('olivia', 'owner'), MEMBER_READERS.administrator), []);
	assert.deepEqual(idsFor(memberOf('ada', 'administrator'), MEMBER_READERS.administrator), []);
	assert.deepEqual(idsFor(memberOf('sami', 'member'), MEMBER_READERS.administrator), [
		'member.edit',
		'member.makeLink',
		'member.unsetPassword',
		'member.endSessions',
		'member.remove'
	]);
	// a member who may only rename meets the one edit, and nothing else.
	assert.deepEqual(
		idsFor(memberOf('ada', 'administrator'), MEMBER_READERS['member widened by renameMember']),
		['member.edit']
	);
	assert.deepEqual(
		idsFor(memberOf('ada', 'administrator'), MEMBER_READERS['member holding nothing']),
		[]
	);

	const edit = acts.find((act) => act.id === 'member.edit')!;
	const contractEdit = declareContractActs(recordingHost().host).find(
		(act) => act.id === 'contract.edit'
	)!;

	assert.equal(edit.label(translations), translations.common.actions.edit());
	assert.equal(edit.icon, contractEdit.icon);
});

test('a member act waiting on the shell is shown and refused until it lands', () => {
	const acts = declareMemberActs(recordingOrganizationHost().member);
	const record = {
		member: memberOf('sami', 'member'),
		context: { ...MEMBER_READERS.owner, pending: { ...IDLE, linking: true } }
	};
	const entry = (id: string) =>
		toCardActions(acts, record, translations).find(
			(action) => action.attributes?.['data-act'] === id
		);

	// refused with its reason, which the card's menus show beside the entry.
	assert.equal(entry('member.makeLink')?.unavailable, translations.common.actions.working());
	assert.equal(entry('member.edit')?.unavailable, undefined);
});

const workspaceOf = (id: string): OrganizationWorkspace => ({
	id,
	name: id,
	databaseName: id,
	databaseHostname: `${id}.turso.io`,
	schemaVersion: 1,
	accessLevel: 'full-access'
});

/** the readers a workspace's card is read by; ws-1 is the one open on this machine. */
const WORKSPACE_READERS: Record<string, WorkspaceActContext> = {
	owner: { openWorkspaceId: 'ws-1', canRename: true, canGrantWorkspace: true, canDelete: true },
	administrator: {
		openWorkspaceId: 'ws-1',
		canRename: true,
		canGrantWorkspace: true,
		canDelete: false
	},
	'member widened by renameWorkspace': {
		openWorkspaceId: 'ws-1',
		canRename: true,
		canGrantWorkspace: false,
		canDelete: false
	},
	'member holding nothing': {
		openWorkspaceId: 'ws-1',
		canRename: false,
		canGrantWorkspace: false,
		canDelete: false
	}
};

for (const [reader, context] of Object.entries(WORKSPACE_READERS)) {
	for (const workspace of [workspaceOf('ws-1'), workspaceOf('ws-2')]) {
		test(`the card of ${workspace.id}, read by the ${reader}, offers the same acts on the card, the page and the palette`, () => {
			const acts = declareWorkspaceActs(recordingOrganizationHost().workspace);
			const record = { workspace, context };

			const card = reduce(
				toCardActions(acts, record, translations).map((action) => ({
					id: action.attributes?.['data-act'],
					label: action.label,
					icon: action.icon
				}))
			);
			const page = reduce(toPageActions(acts, record, translations));
			const palette = reduce(toPaletteVerbs(acts, record, translations, false));

			assert.ok(
				card.every((entry) => ORGANIZATION_GLYPHS.includes(entry.icon ?? '')),
				'every entry carries its glyph'
			);
			assert.deepEqual(page, card);
			assert.deepEqual(palette, card);
		});
	}
}

test('a workspace is edited only where it is open, and the owner alone deletes one', () => {
	const acts = declareWorkspaceActs(recordingOrganizationHost().workspace);
	const idsFor = (id: string, reader: string) =>
		toPageActions(
			acts,
			{ workspace: workspaceOf(id), context: WORKSPACE_READERS[reader] },
			translations
		).map((act) => act.id);

	assert.deepEqual(idsFor('ws-1', 'owner'), [
		'workspace.edit',
		'workspace.members',
		'workspace.delete'
	]);
	assert.deepEqual(idsFor('ws-2', 'owner'), ['workspace.members', 'workspace.delete']);
	assert.deepEqual(idsFor('ws-1', 'administrator'), ['workspace.edit', 'workspace.members']);
	assert.deepEqual(idsFor('ws-1', 'member widened by renameWorkspace'), ['workspace.edit']);
	assert.deepEqual(idsFor('ws-2', 'member widened by renameWorkspace'), []);
	assert.deepEqual(idsFor('ws-1', 'member holding nothing'), []);

	const edit = acts.find((act) => act.id === 'workspace.edit')!;

	assert.equal(edit.label(translations), translations.common.actions.edit());
});

test('the destructive group comes last on a member and on a workspace', () => {
	const host = recordingOrganizationHost();

	for (const acts of [declareMemberActs(host.member), declareWorkspaceActs(host.workspace)]) {
		const groups: (string | undefined)[] = acts.map((act) => act.group);
		const first = groups.indexOf('destructive');

		assert.equal(groups.at(-1), 'destructive');
		assert.ok(groups.slice(first).every((group) => group === 'destructive'));
	}
});

test('every organization surface runs an act by asking the host, on the record it was offered for', () => {
	const host = recordingOrganizationHost();
	const memberActs = declareMemberActs(host.member);
	const workspaceActs = declareWorkspaceActs(host.workspace);
	const sami = { member: memberOf('sami', 'member'), context: MEMBER_READERS.owner };
	const open = { workspace: workspaceOf('ws-1'), context: WORKSPACE_READERS.owner };

	toCardActions(memberActs, sami, translations)
		.find((action) => action.attributes?.['data-act'] === 'member.lockOut')
		?.onSelect();
	toPaletteVerbs(memberActs, sami, translations, false)
		.find((act) => act.id === 'member.edit')
		?.run();
	toCardActions(workspaceActs, open, translations)
		.find((action) => action.attributes?.['data-act'] === 'workspace.members')
		?.onSelect();
	toPaletteVerbs(workspaceActs, open, translations, false)
		.find((act) => act.id === 'workspace.delete')
		?.run();

	assert.deepEqual(host.asked, [
		'confirm.lockOut:sami',
		'edit:sami',
		'changeAccess:ws-1',
		'confirmDelete:ws-1'
	]);
});

// requirement 16 of effort 832: the ledger's two notices are the create act's reasons, one line
// each, and a contract that takes a payment gives none.
test('a new payment is refused, with its reason, on a terminated or a fully paid contract', () => {
	const running = { status: 'active' as const, paidAmount: 1500, expectedAmount: 18000 };

	assert.equal(toPaymentCreateUnavailable(running, translations), undefined);
	assert.equal(toPaymentCreateUnavailable(undefined, translations), undefined);
	assert.equal(
		toPaymentCreateUnavailable({ ...running, status: 'terminated' }, translations),
		translations.contracts.payments.terminatedNotice()
	);
	assert.equal(
		toPaymentCreateUnavailable({ ...running, paidAmount: 18000 }, translations),
		translations.contracts.payments.fullyPaidNotice()
	);
});

// ticket 38: a duplicate is a new payment, so a contract paid in full refuses it with the reason it
// refuses creating one. Only the duplicate: correcting or removing what the contract holds is
// still open, and a surface that has not read the amounts refuses no more than it did.
test('duplicating a payment is refused on a fully paid contract, as creating one is', () => {
	const acts = declarePaymentActs(
		recordingRequests(['copyDetails', 'duplicate', 'edit', 'confirmDelete'] as const).host
	);
	const refusedOn = (amounts: { contractPaidAmount?: number; contractExpectedAmount?: number }) =>
		toPageActions(acts, { ...paymentAgainst('fulfilled'), ...amounts }, translations)
			.filter((act) => act.unavailable)
			.map((act) => [act.id, act.unavailable]);

	assert.deepEqual(refusedOn({ contractPaidAmount: 18000, contractExpectedAmount: 18000 }), [
		['payment.duplicate', translations.contracts.payments.fullyPaidNotice()]
	]);
	assert.deepEqual(refusedOn({ contractPaidAmount: 1500, contractExpectedAmount: 18000 }), []);
	assert.deepEqual(refusedOn({}), []);
});
