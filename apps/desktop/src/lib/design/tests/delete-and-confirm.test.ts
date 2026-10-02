import assert from 'node:assert/strict';
import { beforeEach, describe, it, mock } from 'node:test';

import type { CreateMutationResult } from '@tanstack/svelte-query';

import { type Api, createApi, monthsFromNow, seedTenant } from '$lib/app/tests/testing.ts';
import { bindingOf } from '#tests/mutation.ts';

/**
 * DELETE AND CONFIRM
 *
 * Requirement 11 of effort 832, criterion 11 (a), as effort 846 revised it on 2026-10-02: a
 * record's delete asks first (`act/tests/dangerous-acts-ask.svelte.test.ts`), and once answered it
 * offers undo, and the undo it offers puts the record back. Read here through what the reader
 * actually meets, the announcement and the control on it, rather than through the undo stack
 * underneath: the toast is substituted to keep what it was asked to render, and its control is
 * pressed.
 *
 * The procedures are real, over the in-memory database `app/tests/testing.ts` builds, the way
 * `api/tests/undo.test.ts` drives them. Nothing here reaches a workspace on disk or a remote.
 *
 * What each concept declares for its destructive acts is read here too.
 */

let caller: Api = await createApi();

mock.module('$lib/api/caller', {
	exports: {
		default: new Proxy(caller, { get: (_target, concept) => Reflect.get(caller, concept) })
	}
});

mock.module('@tanstack/svelte-query', {
	exports: {
		useQueryClient: () => ({ invalidateQueries: async () => {} }),
		createMutation: (options: () => unknown) => options(),
		createQuery: () => ({})
	}
});

/** the control an announcement carries when the change behind it can be taken back. */
type OfferAction = { label: string; onClick: () => Promise<void> | undefined };

/** one success announcement, as the substituted toast was asked to render it. */
type Announcement = {
	message: string;
	options?: { description?: string; action?: OfferAction; duration?: number };
};

const announced: Announcement[] = [];

mock.module('svelte-sonner', {
	exports: {
		toast: {
			success: (message: string, options?: Announcement['options']) => {
				announced.push({ message, options });

				return announced.length;
			},
			error: () => {},
			warning: () => {},
			dismiss: () => {}
		}
	}
});

mock.module('$lib/sync/tauri', {
	exports: { tauri: { getState: async () => ({}) } }
});

// the acts' glyphs are Svelte components, which this runner cannot load. Only what an act
// declares about asking is read here, so each glyph is an empty stand-in.
for (const glyph of [
	'arrow-down',
	'arrow-up',
	'ban',
	'calendar-plus',
	'copy',
	'crown',
	'file-down',
	'file-plus',
	'file-up',
	'files',
	'laptop',
	'link',
	'lock',
	'message-circle',
	'printer',
	'refresh-cw',
	'rotate-ccw',
	'square-pen',
	'trash-2',
	'user-minus',
	'users'
]) {
	mock.module(`@lucide/svelte/icons/${glyph}`, { exports: { default: () => {} } });
}

const { inverseStack } = await import('$lib/undo/undo');
const { useDeleteTenant } = await import('$lib/tenant/query');
const { useCreateComplex, useDeleteComplex } = await import('$lib/complex/query');
const { useCreateUnit, useDeleteUnit } = await import('$lib/complex/unit/query');
const { useCreateContract, useDeleteContract } = await import('$lib/contract/query');
const { useCreatePayment, useDeletePayment } = await import('$lib/payment/query');
const { declareTenantActs } = await import('$lib/tenant/acts');
const { declareComplexActs, toComplexDeleteConfirmation } = await import('$lib/complex/acts');
const { declareUnitActs } = await import('$lib/complex/unit/acts');
const { declarePaymentActs } = await import('$lib/payment/acts');
const { declareContractActs } = await import('$lib/contract/acts');
const { declareMemberActs } = await import('$lib/organization/member/acts');
const { declareRoleActs } = await import('$lib/organization/role/acts');
const { declareWorkspaceActs } = await import('$lib/organization/workspace/acts');
const { loadLocale } = await import('$lib/i18n/i18n-util.sync');
const { LL, setLocale } = await import('$lib/i18n/i18n-svelte');
const { get } = await import('svelte/store');

// the cache policy the root layout provides, built from the features' declarations: a settled
// mutation invalidates by it.
await import('$lib/app/cache');

loadLocale('en');
setLocale('en');

/** Drive one declared mutation the way the query client does: capture, call, then settle. */
async function run<TVariables, TResult, TCaptured>(
	hook: () => CreateMutationResult<TResult, Error, TVariables, TCaptured>,
	variables: TVariables
): Promise<TResult> {
	const mutation = bindingOf(hook);
	const captured = await mutation.onMutate?.(variables);
	const result = await mutation.mutationFn(variables);

	await mutation.onSuccess(result, variables, captured);

	return result;
}

/** The announcement a delete raised, which must carry the undo control and say how long it lasts. */
function deleteAnnouncement() {
	const last = announced.at(-1);

	assert.ok(last, 'the delete was announced');
	assert.equal(last.options?.action?.label, get(LL).common.undo.undo());
	assert.equal(last.options?.description, get(LL).common.undo.lasts());

	return last;
}

/** Press the announcement's undo, the way the reader does. */
async function pressUndo(announcement: Announcement) {
	await announcement.options?.action?.onClick();
}

beforeEach(async () => {
	inverseStack.clear();
	announced.length = 0;
	caller = await createApi();
});

describe('a record delete, once answered, offers undo', () => {
	it('puts back a tenant with no contracts', async () => {
		const tenant = await seedTenant(caller);

		await run(useDeleteTenant, tenant.id);
		assert.equal(await caller.tenant.get({ id: tenant.id }), undefined);

		await pressUndo(deleteAnnouncement());
		assert.deepEqual(await caller.tenant.get({ id: tenant.id }), tenant);
	});

	it('puts back a unit', async () => {
		const complex = await run(useCreateComplex, { name: 'Tower', location: 'Riyadh' });
		const unit = await run(useCreateUnit, { name: 'A1', complexId: complex.id });

		await run(useDeleteUnit, unit.id);
		assert.equal(await caller.complex.units.get({ id: unit.id }), undefined);

		await pressUndo(deleteAnnouncement());
		assert.equal((await caller.complex.units.get({ id: unit.id }))?.name, 'A1');
	});

	it('puts back a payment', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});
		const payment = await run(useCreatePayment, {
			contractId: contract.id,
			date: monthsFromNow(0),
			amount: 1000
		});

		await run(useDeletePayment, payment.id);
		assert.equal(await caller.payment.get({ id: payment.id }), undefined);

		await pressUndo(deleteAnnouncement());
		assert.equal((await caller.payment.get({ id: payment.id }))?.amount, 1000);
	});

	it('puts back a contract with no payments', async () => {
		const tenant = await seedTenant(caller);
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await run(useDeleteContract, contract.id);
		assert.equal(await caller.contract.get({ id: contract.id }), undefined);

		await pressUndo(deleteAnnouncement());
		assert.equal((await caller.contract.get({ id: contract.id }))?.id, contract.id);
	});

	// ticket 38: a contract is created holding its units, so a rule refusing one for holding them
	// left criterion 11(a) out of reach for nearly every contract that had taken no money.
	it('puts back a contract created with its units, holding them again', async () => {
		const tenant = await seedTenant(caller);
		const complex = await run(useCreateComplex, { name: 'Tower', location: 'Riyadh' });
		const unit = await run(useCreateUnit, { name: 'A1', complexId: complex.id });
		const contract = await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000,
			unitIds: [unit.id]
		});

		await run(useDeleteContract, contract.id);
		assert.equal(await caller.contract.get({ id: contract.id }), undefined);
		assert.equal((await caller.complex.units.get({ id: unit.id }))?.status, 'vacant');

		await pressUndo(deleteAnnouncement());
		assert.equal((await caller.contract.get({ id: contract.id }))?.id, contract.id);
		assert.deepEqual(
			(await caller.contract.units.getMany({ contractId: contract.id })).map((held) => held.id),
			[unit.id]
		);
		assert.equal((await caller.complex.units.get({ id: unit.id }))?.status, 'occupied');
	});

	// effort 840, requirement 22: it asks first, and is undone whole all the same.
	it('puts back a complex deleted with its units, each unit as it was', async () => {
		const complex = await run(useCreateComplex, {
			name: 'Tower',
			location: 'Riyadh',
			units: [{ name: 'A1' }, { name: 'A2' }]
		});
		const units = await caller.complex.units.getMany({ complexId: complex.id });

		await run(useDeleteComplex, complex.id);
		assert.equal(await caller.complex.get({ id: complex.id }), undefined);
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), []);

		await pressUndo(deleteAnnouncement());
		assert.equal((await caller.complex.get({ id: complex.id }))?.name, 'Tower');
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), units);
	});

	// a unit another device added is taken by the next deletion and put back by the next undo, so
	// neither direction loses it.
	it('takes back and puts back a unit added after a complex was deleted and restored', async () => {
		const complex = await run(useCreateComplex, {
			name: 'Tower',
			location: 'Riyadh',
			units: [{ name: 'A1' }, { name: 'A2' }]
		});

		await run(useDeleteComplex, complex.id);
		await inverseStack.undo();
		await caller.complex.units.create({ name: 'A3', complexId: complex.id });

		const units = await caller.complex.units.getMany({ complexId: complex.id });

		assert.equal(units.length, 3);

		await inverseStack.redo();
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), []);

		await inverseStack.undo();
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), units);
	});

	it('undoes a creation whole, and redoing it brings back every unit it took', async () => {
		const complex = await run(useCreateComplex, {
			name: 'Tower',
			location: 'Riyadh',
			units: [{ name: 'A1' }]
		});

		// another device adds a unit before the creation is taken back.
		await caller.complex.units.create({ name: 'A2', complexId: complex.id });
		const units = await caller.complex.units.getMany({ complexId: complex.id });

		await inverseStack.undo();
		assert.equal(await caller.complex.get({ id: complex.id }), undefined);
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), []);

		await inverseStack.redo();
		assert.equal((await caller.complex.get({ id: complex.id }))?.name, 'Tower');
		assert.deepEqual(await caller.complex.units.getMany({ complexId: complex.id }), units);
	});

	it('still refuses a tenant with contracts, and deletes nothing', async () => {
		const tenant = await seedTenant(caller);

		await run(useCreateContract, {
			tenantId: tenant.id,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

		await assert.rejects(() => bindingOf(useDeleteTenant).mutationFn(tenant.id));
		assert.deepEqual(await caller.tenant.get({ id: tenant.id }), tenant);
	});
});

describe('what each concept declares about asking', () => {
	// every request answers nothing: only what the acts declare is read.
	const host = new Proxy({}, { get: () => () => {} }) as never;

	const declared = {
		tenant: declareTenantActs(host),
		complex: declareComplexActs(host),
		unit: declareUnitActs(host),
		payment: declarePaymentActs(host),
		contract: declareContractActs(host),
		member: declareMemberActs(host),
		workspace: declareWorkspaceActs(host),
		role: declareRoleActs(host)
	};

	it('every destructive act declares what its question says', () => {
		for (const [concept, acts] of Object.entries(declared)) {
			for (const act of acts.filter(
				(declaredAct) => declaredAct.group === 'destructive' || declaredAct.tone === 'error'
			)) {
				assert.ok(act.confirmation, `${concept}: ${act.id} declares no confirmation policy`);
			}
		}
	});

	it('a record that takes nothing else with it asks, saying undo brings it back', () => {
		const policyOf = (acts: { id: string; confirmation?: string }[], id: string) =>
			acts.find((act) => act.id === id)?.confirmation;

		assert.equal(policyOf(declared.tenant, 'tenant.delete'), 'reversible');
		assert.equal(policyOf(declared.complex, 'complex.delete'), 'reversible');
		assert.equal(policyOf(declared.unit, 'unit.delete'), 'reversible');
		assert.equal(policyOf(declared.payment, 'payment.delete'), 'reversible');
		assert.equal(policyOf(declared.contract, 'contract.delete'), 'reversible');
	});

	// effort 840, requirement 22: its units go with it, so it removes more than the record.
	it('a complex whose units go with it cascades, and one with none does not', () => {
		const declaredPolicy = declared.complex.find(
			(act) => act.id === 'complex.delete'
		)?.confirmation;

		assert.equal(toComplexDeleteConfirmation(declaredPolicy, 0), 'reversible');
		assert.equal(toComplexDeleteConfirmation(declaredPolicy, 3), 'cascade');
	});

	it('what nothing puts back asks first: a workspace, a member removed, and a role deleted', () => {
		const policyOf = (acts: { id: string; confirmation?: string }[], id: string) =>
			acts.find((act) => act.id === id)?.confirmation;

		assert.equal(policyOf(declared.workspace, 'workspace.delete'), 'irreversible');
		assert.equal(policyOf(declared.member, 'member.remove'), 'irreversible');
		// a role deleted moves its holders to the member role, and no organization act is undone.
		assert.equal(policyOf(declared.role, 'role.delete'), 'irreversible');
		assert.equal(policyOf(declared.member, 'member.lockOut'), 'irreversible');
	});
});
