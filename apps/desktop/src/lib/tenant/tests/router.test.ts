import assert from 'node:assert/strict';
import test from 'node:test';

import {
	type Api,
	countMatching,
	createApi,
	monthsFromNow,
	seedTenant,
	unusedId,
	withStatementLog
} from '$lib/api/tests/testing.ts';
import { isRecordId } from '$lib/platform/database/identity.ts';
import type { ListSort } from '$lib/design/sort.ts';
import type { TenantSortColumnId } from '$lib/tenant/tenant.ts';

/** what a tenant's row looks like on the directory list, and the sort it may be asked for. */
type ListedTenant = Awaited<ReturnType<Api['tenant']['getMany']>>[number];
type TenantSort = NonNullable<NonNullable<Parameters<Api['tenant']['getMany']>[0]>['sort']>;

const NATIONAL_ID = '1234567890';
const IQAMA = '2345678901';
const PHONE = '+966551234567';

// --- Creation ------------------------------------------------------------------------

test('creating a tenant returns it with its fields', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	assert.equal(tenant.name, 'Sara');
	assert.equal(tenant.nationalId, NATIONAL_ID);
	assert.equal(tenant.phone, PHONE);
	assert.ok(isRecordId(tenant.id));
});

// --- Identity-number validation (both accepted document types) -----------------------

test('a national id (prefix 1) is accepted', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	assert.equal(tenant.nationalId, NATIONAL_ID);
});

test('an iqama (prefix 2) is accepted', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({ name: 'Omar', nationalId: IQAMA, phone: PHONE });

	assert.equal(tenant.nationalId, IQAMA);
});

test('an identity number with a disallowed prefix is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: '3234567890', phone: PHONE }),
		/must start with 1 or 2/
	);
});

test('an identity number of the wrong length is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: '12345', phone: PHONE }),
		/must start with 1 or 2/
	);
});

test('an identity number padded with non-whitespace characters is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: `!${NATIONAL_ID}!`, phone: PHONE }),
		/must start with 1 or 2/
	);
});

test('an identity number embedded in a longer string is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() =>
			api.tenant.create({
				name: 'Sara',
				nationalId: `hello ${NATIONAL_ID} world`,
				phone: PHONE
			}),
		/must start with 1 or 2/
	);
});

test('an identity number surrounded by whitespace is accepted and stored without it', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({
		name: 'Sara',
		nationalId: `  ${NATIONAL_ID}  `,
		phone: PHONE
	});

	assert.equal(tenant.nationalId, NATIONAL_ID);
});

test('a tenant holding a padded identity can be saved without editing that field', async () => {
	const api = await createApi();

	const tenant = await api.tenant.create({
		name: 'Sara',
		nationalId: ` ${NATIONAL_ID} `,
		phone: PHONE
	});

	const updated = await api.tenant.update({
		id: tenant.id,
		name: 'Sara Al-Otaibi',
		nationalId: ` ${NATIONAL_ID} `
	});

	assert.equal(updated.name, 'Sara Al-Otaibi');
	assert.equal(updated.nationalId, NATIONAL_ID);
});

// --- Phone validation ----------------------------------------------------------------

test('a phone without the +9665 prefix is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: '0551234567' }),
		/phone must start with \+966/
	);
});

test('a phone of the wrong length is rejected', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: '+96655123' }),
		/phone must start with \+966/
	);
});

// --- Uniqueness ----------------------------------------------------------------------

test('creating a tenant with a national id already in use is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	await assert.rejects(
		() => api.tenant.create({ name: 'Omar', nationalId: NATIONAL_ID, phone: '+966551234500' }),
		/national id is associated with a registered tenant/
	);
});

test('creating a tenant with a phone already in use is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	await assert.rejects(
		() => api.tenant.create({ name: 'Omar', nationalId: IQAMA, phone: PHONE }),
		/phone is associated with a registered tenant/
	);
});

// --- Update --------------------------------------------------------------------------

test('updating a tenant changes its fields', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({
		id: tenant.id,
		name: 'Sara Ali',
		nationalId: NATIONAL_ID,
		phone: PHONE
	});

	assert.equal(updated.name, 'Sara Ali');
});

test('a name-only update succeeds and leaves the identity fields intact', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	// pinned the crash before #135; the partial update the input schema advertises now works.
	const updated = await api.tenant.update({ id: tenant.id, name: 'Sara Ali' });

	assert.equal(updated.name, 'Sara Ali');
	assert.equal(updated.nationalId, NATIONAL_ID);
	assert.equal(updated.phone, PHONE);
});

test('a national-id-only update succeeds and leaves the other fields intact', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({ id: tenant.id, nationalId: IQAMA });

	assert.equal(updated.name, 'Sara');
	assert.equal(updated.nationalId, IQAMA);
	assert.equal(updated.phone, PHONE);
});

test('a phone-only update succeeds and leaves the other fields intact', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({ id: tenant.id, phone: '+966551234500' });

	assert.equal(updated.name, 'Sara');
	assert.equal(updated.nationalId, NATIONAL_ID);
	assert.equal(updated.phone, '+966551234500');
});

test('an id-only update is a no-op that returns the tenant unchanged', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	const updated = await api.tenant.update({ id: tenant.id });

	assert.deepEqual(updated, tenant);
});

// This asserted the opposite until 2026-08-18: the read-back had no row to return, and nothing
// said so. An update that quietly answers with nothing reads at every call site as success, which
// is survivable only while this machine is the only writer — [[rules/data]], under *Undo*, is
// where the reasoning is, and an inverse is the caller that meets it first.
test('an id-only update for a tenant that does not exist says so rather than answering with nothing', async () => {
	const api = await createApi();

	await assert.rejects(
		() => api.tenant.update({ id: unusedId() }),
		/this tenant is no longer in the workspace/
	);
});

test('a partial update to an identity used by another tenant is still rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	const other = await api.tenant.create({
		name: 'Omar',
		nationalId: IQAMA,
		phone: '+966551234500'
	});

	await assert.rejects(
		() => api.tenant.update({ id: other.id, nationalId: NATIONAL_ID }),
		/national id is associated with a registered tenant/
	);
	await assert.rejects(
		() => api.tenant.update({ id: other.id, phone: PHONE }),
		/phone is associated with a registered tenant/
	);
});

test('updating a tenant to a national id used by another tenant is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	const other = await api.tenant.create({
		name: 'Omar',
		nationalId: IQAMA,
		phone: '+966551234500'
	});

	await assert.rejects(
		() =>
			api.tenant.update({
				id: other.id,
				name: 'Omar',
				nationalId: NATIONAL_ID,
				phone: '+966551234500'
			}),
		/national id is associated with a registered tenant/
	);
});

test('updating a tenant to a phone used by another tenant is rejected', async () => {
	const api = await createApi();
	await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	const other = await api.tenant.create({
		name: 'Omar',
		nationalId: IQAMA,
		phone: '+966551234500'
	});

	await assert.rejects(
		() => api.tenant.update({ id: other.id, name: 'Omar', nationalId: IQAMA, phone: PHONE }),
		/phone is associated with a registered tenant/
	);
});

// --- Deletion ------------------------------------------------------------------------

test('deleting a tenant without contracts removes it', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });

	await api.tenant.delete({ id: tenant.id });

	const found = await api.tenant.get({ id: tenant.id });
	assert.equal(found, undefined);
});

test('deleting a tenant that has a contract is rejected', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);
	await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	await assert.rejects(
		() => api.tenant.delete({ id: tenant.id }),
		/cannot delete tenant with associated contracts/
	);
});

// --- What a selection would do -------------------------------------------------------
//
// The plan and the deletion go through one call, so they cannot answer differently about
// what a refusal is. What they can differ about is the workspace, because another device
// may write between the reader being shown a plan and reaching for the control, and the
// deletion is what is authoritative about that.

/** the identities out of what a multi-record action reported it changed. */
const toIds = (tenants: readonly { id: string }[]) => tenants.map((tenant) => tenant.id);

async function seedTenantHoldingAContract(api: Api) {
	const tenant = await seedTenant(api);

	await api.contract.create({
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	return tenant;
}

test('a plan says which of a selection would go through and which would not', async () => {
	const api = await createApi();
	const free = await seedTenant(api);
	const held = await seedTenantHoldingAContract(api);
	const gone = unusedId();

	const plan = await api.tenant.planMany({ ids: [free.id, held.id, gone] });

	assert.deepEqual(plan.eligible, [free.id]);
	assert.deepEqual(plan.refused, [
		{ id: held.id, name: held.name, reason: 'holds-contracts' },
		// nothing survived to name it by, so the count against the reason is what carries it.
		{ id: gone, name: '', reason: 'missing' }
	]);
});

test('asking what a deletion would do writes nothing', async () => {
	const api = await createApi();
	const free = await seedTenant(api);
	const held = await seedTenantHoldingAContract(api);

	await api.tenant.planMany({ ids: [free.id, held.id] });

	assert.ok(await api.tenant.get({ id: free.id }));
	assert.ok(await api.tenant.get({ id: held.id }));
});

// the claim the whole confirmation rests on: what the reader is shown is what the deletion
// then decides, because both are the same call over the same workspace.
test('a plan and the deletion it precedes refuse exactly the same tenants', async () => {
	const api = await createApi();
	const free = await seedTenant(api);
	const held = await seedTenantHoldingAContract(api);
	const gone = unusedId();
	const ids = [free.id, held.id, gone];

	const plan = await api.tenant.planMany({ ids });
	const result = await api.tenant.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [...plan.eligible]);
	assert.deepEqual(result.refused, plan.refused);
	// and every tenant named is accounted for on one side or the other: a set that reported
	// neither a deletion nor a refusal for one of them would pass the two lines above.
	assert.deepEqual(
		[...toIds(result.deleted), ...result.refused.map((refusal) => refusal.id)].sort(),
		[...ids].sort()
	);
});

// the plan is what the reader agreed to, and the deletion is what happened. Where the
// workspace moved in between, the second is the answer.
test('what the deletion refuses is what happened, not what the plan showed', async () => {
	const api = await createApi();
	const first = await seedTenant(api);
	const second = await seedTenant(api);
	const ids = [first.id, second.id];

	const plan = await api.tenant.planMany({ ids });
	assert.deepEqual(plan.eligible.sort(), [...ids].sort());

	// somebody else gives the second tenant a contract while the confirmation is open.
	await api.contract.create({
		tenantId: second.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000
	});

	const result = await api.tenant.deleteMany({ ids });

	assert.deepEqual(toIds(result.deleted), [first.id]);
	assert.deepEqual(result.refused, [
		{ id: second.id, name: second.name, reason: 'holds-contracts' }
	]);
});

test('several tenants are deleted by one action, and the rest are named', async () => {
	const api = await createApi();
	const first = await seedTenant(api);
	const second = await seedTenant(api);
	const held = await seedTenantHoldingAContract(api);

	const result = await api.tenant.deleteMany({ ids: [first.id, second.id, held.id] });

	assert.deepEqual(toIds(result.deleted).sort(), [first.id, second.id].sort());
	assert.deepEqual(result.refused, [{ id: held.id, name: held.name, reason: 'holds-contracts' }]);

	for (const id of [first.id, second.id]) {
		assert.equal(await api.tenant.get({ id }), undefined);
	}

	assert.ok(await api.tenant.get({ id: held.id }), 'the refused tenant is still there');
});

// the assertion the ticket exists for, and it is about cost rather than outcome: a selection
// is one thing the reader asked for, and issuing it as N calls costs a round trip per record
// for work one statement does. A tenant carries nothing derived, so there is no reconcile
// pass here to count.
test('deleting many issues one delete rather than one per record', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedTenant(api)).id);
		}

		drain();

		await api.tenant.deleteMany({ ids });
	});

	assert.equal(countMatching(statements, /^\s*delete from "tenant"/i), 1);
});

// --- Putting a deleted selection back ------------------------------------------------

test('a deleted selection is put back whole, each tenant with the identity it had', async () => {
	const api = await createApi();
	const first = await seedTenant(api);
	const second = await seedTenant(api);

	const deleted = await api.tenant.deleteMany({ ids: [first.id, second.id] });
	const restored = await api.tenant.createMany({ tenants: deleted.deleted });

	assert.deepEqual(toIds(restored).sort(), [first.id, second.id].sort());

	for (const original of [first, second]) {
		const back = await api.tenant.get({ id: original.id });

		assert.ok(back, 'the tenant is there under the identity it had');
		assert.equal(back.name, original.name);
		assert.equal(back.nationalId, original.nationalId);
		assert.equal(back.phone, original.phone);
	}
});

// all or nothing, and the reason: a set half restored is a workspace in a shape neither the
// deletion nor the undo describes. The reader is told which one blocked it, by name.
test('and where one of them cannot be put back, none is', async () => {
	const api = await createApi();
	const first = await seedTenant(api);
	const second = await seedTenant(api);

	const deleted = await api.tenant.deleteMany({ ids: [first.id, second.id] });

	// somebody registers a tenant on the identity one of them held while the deletion sits on
	// the undo stack.
	await api.tenant.create({
		name: 'Impostor',
		nationalId: second.nationalId,
		phone: '+966559999999'
	});

	await assert.rejects(
		() => api.tenant.createMany({ tenants: deleted.deleted }),
		new RegExp(`national id ${second.nationalId} is associated with a registered tenant`)
	);

	assert.equal(await api.tenant.get({ id: first.id }), undefined);
});

test('and a set claiming one national id twice is refused before anything is written', async () => {
	const api = await createApi();
	const first = await seedTenant(api);
	const second = await seedTenant(api);

	const deleted = await api.tenant.deleteMany({ ids: [first.id, second.id] });
	const [head, tail] = deleted.deleted;

	await assert.rejects(
		() =>
			api.tenant.createMany({
				tenants: [head, { ...tail, nationalId: head.nationalId }]
			}),
		new RegExp(`two tenants in this set claim ${head.nationalId}`)
	);

	assert.equal(await api.tenant.get({ id: head.id }), undefined);
});

test('putting a selection back asks each uniqueness question once for the whole set', async () => {
	const statements = await withStatementLog(async (api, drain) => {
		const ids = [];

		for (let index = 0; index < 3; index += 1) {
			ids.push((await seedTenant(api)).id);
		}

		const deleted = await api.tenant.deleteMany({ ids });

		drain();

		await api.tenant.createMany({ tenants: deleted.deleted });
	});

	// three rows go in, and the three things a tenant is unique by are asked once each over the
	// whole set rather than once per record. That the three inserts land together or not at all
	// is the batch's, asserted by the test above through what it leaves behind.
	assert.equal(countMatching(statements, /^\s*insert into "tenant"/i), 3);
	assert.ok(
		countMatching(statements, /select .* from "tenant" where/i) <= 3,
		`one pass per question, not one per row: ${statements.filter((sql) => /select .* from "tenant" where/i.test(sql)).length}`
	);
});

// --- The directory list -------------------------------------------------------------
//
// `getMany` answers the tenants list, which reads as a directory: the order is the
// reader's, and the figure per contract status is an aggregate on the same query. Both are
// asserted here because both are what the list may not redo on the client.

async function seedContract(
	api: Api,
	tenantId: string,
	overrides: Partial<Parameters<Api['contract']['create']>[0]> = {}
) {
	return api.contract.create({
		tenantId,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '12m',
		cost: 1000,
		...overrides
	});
}

/** the six figures off a listed row, named by status so a mis-keyed one reads as one. */
const statusCounts = (listed: ListedTenant) => ({
	scheduled: listed.contractsScheduled,
	active: listed.contractsActive,
	fulfilled: listed.contractsFulfilled,
	defaulted: listed.contractsDefaulted,
	expired: listed.contractsExpired,
	terminated: listed.contractsTerminated
});

test('a tenant with no contracts is listed with a zero against every status', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	const [listed] = await api.tenant.getMany({});

	assert.equal(listed.id, tenant.id);
	assert.deepEqual(statusCounts(listed), {
		scheduled: 0,
		active: 0,
		fulfilled: 0,
		defaulted: 0,
		expired: 0,
		terminated: 0
	});
});

test('a row carries one figure per status, and each counts only its own', async () => {
	const api = await createApi();
	const tenant = await seedTenant(api);

	// one contract in each of the six statuses. A tenant holding exactly one everywhere is what
	// makes a conditional count wired to the wrong status show up as a figure in the wrong
	// column rather than as a total that still happens to add up.
	await seedContract(api, tenant.id);

	const fulfilled = await seedContract(api, tenant.id);
	await api.contract.payments.create({
		contractId: fulfilled.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	await seedContract(api, tenant.id, { start: monthsFromNow(-14), end: monthsFromNow(-2) });

	const expired = await seedContract(api, tenant.id, {
		start: monthsFromNow(-14),
		end: monthsFromNow(-2)
	});
	await api.contract.payments.create({
		contractId: expired.id,
		date: monthsFromNow(-8),
		amount: 1_000_000
	});

	await seedContract(api, tenant.id, { start: monthsFromNow(2), end: monthsFromNow(14) });

	const terminated = await seedContract(api, tenant.id);
	await api.contract.terminate({ id: terminated.id });

	const [listed] = await api.tenant.getMany({});

	assert.deepEqual(statusCounts(listed), {
		scheduled: 1,
		active: 1,
		fulfilled: 1,
		defaulted: 1,
		expired: 1,
		terminated: 1
	});
});

test('ordering by contracts counts the ones in force, not every contract held', async () => {
	const api = await createApi();
	const inForce = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const history = await api.tenant.create({
		name: 'Zaid',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// two in force against three that are not, so an order over every contract would invert this
	// and an order over the contracts in force will not.
	await seedContract(api, inForce.id);
	const fulfilled = await seedContract(api, inForce.id);
	await api.contract.payments.create({
		contractId: fulfilled.id,
		date: monthsFromNow(0),
		amount: 1_000_000
	});

	await seedContract(api, history.id, { start: monthsFromNow(-14), end: monthsFromNow(-2) });
	await seedContract(api, history.id, { start: monthsFromNow(2), end: monthsFromNow(14) });
	const terminated = await seedContract(api, history.id);
	await api.contract.terminate({ id: terminated.id });

	assert.deepEqual(
		(
			await api.tenant.getMany({ sort: { columnId: 'activeContractCount', direction: 'desc' } })
		).map((tenant) => tenant.id),
		[inForce.id, history.id]
	);
});

test('the directory opens ordered by name', async () => {
	const api = await createApi();
	const zaid = await seedTenant(api);
	const amal = await seedTenant(api);

	await api.tenant.update({ id: zaid.id, name: 'Zaid' });
	await api.tenant.update({ id: amal.id, name: 'Amal' });

	assert.deepEqual(
		(await api.tenant.getMany({})).map((tenant) => tenant.name),
		['Amal', 'Zaid']
	);
});

test('the directory orders by every key the sort control offers', async () => {
	const api = await createApi();
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	await seedContract(api, zaid.id);

	const orderBy = async (columnId: TenantSortColumnId, direction: ListSort['direction']) =>
		(await api.tenant.getMany({ sort: { columnId, direction } })).map((tenant) => tenant.id);

	assert.deepEqual(await orderBy('name', 'asc'), [amal.id, zaid.id]);
	assert.deepEqual(await orderBy('name', 'desc'), [zaid.id, amal.id]);
	assert.deepEqual(await orderBy('nationalId', 'asc'), [zaid.id, amal.id]);
	assert.deepEqual(await orderBy('nationalId', 'desc'), [amal.id, zaid.id]);
	assert.deepEqual(await orderBy('activeContractCount', 'asc'), [amal.id, zaid.id]);
	assert.deepEqual(await orderBy('activeContractCount', 'desc'), [zaid.id, amal.id]);
});

test('tenants tied on the chosen order fall back to the directory order', async () => {
	const api = await createApi();
	const zaid = await api.tenant.create({
		name: 'Zaid',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const amal = await api.tenant.create({
		name: 'Amal',
		nationalId: '1000000001',
		phone: '+966551110002'
	});

	// created Zaid first, so an id tie-break would put him first and a name one would not.
	await seedContract(api, zaid.id);
	await seedContract(api, amal.id);

	assert.deepEqual(
		(
			await api.tenant.getMany({ sort: { columnId: 'activeContractCount', direction: 'desc' } })
		).map((tenant) => tenant.name),
		['Amal', 'Zaid']
	);
});

test('the directory refuses to order by a column the control does not offer', async () => {
	const api = await createApi();

	// `phone` is outside the sort vocabulary, so it cannot be named in the caller's own type —
	// the vocabulary *is* the type. It arrives here the way a reader's chosen column really
	// does, as the plain string of a `ListSort`, with the vocabulary guard the query layer
	// applies skipped: what is asserted is that the procedure refuses it on its own.
	const chosen: ListSort = { columnId: 'phone', direction: 'asc' };

	await assert.rejects(() => api.tenant.getMany({ sort: chosen as TenantSort }));
});

test('searching the directory narrows it and keeps the chosen order', async () => {
	const api = await createApi();
	const amal = await api.tenant.create({
		name: 'Amal Odeh',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	const zaid = await api.tenant.create({
		name: 'Zaid Odeh',
		nationalId: '1000000001',
		phone: '+966551110002'
	});
	await api.tenant.create({ name: 'Rana Saleh', nationalId: '1000000002', phone: '+966551110003' });

	await seedContract(api, zaid.id);

	const listed = await api.tenant.getMany({
		search: 'Odeh',
		sort: { columnId: 'activeContractCount', direction: 'desc' }
	});

	assert.deepEqual(
		listed.map((tenant) => tenant.id),
		[zaid.id, amal.id]
	);
	assert.deepEqual(
		listed.map((tenant) => tenant.contractsActive),
		[1, 0]
	);
});

test('searching the directory reaches the national id and the phone', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Amal',
		nationalId: '2999999999',
		phone: '+966551110001'
	});
	await api.tenant.create({ name: 'Rana', nationalId: '1000000002', phone: '+966551110003' });

	for (const term of ['2999999999', '+966551110001', 'Amal']) {
		assert.deepEqual(
			(await api.tenant.getMany({ search: term })).map((candidate) => candidate.id),
			[tenant.id],
			`search term ${term}`
		);
	}
});

// --- Palette search -------------------------------------------------------------------

test('a tenant is found by name, identity or phone', async () => {
	const api = await createApi();
	const sara = await api.tenant.create({ name: 'Sara', nationalId: NATIONAL_ID, phone: PHONE });
	await api.tenant.create({ name: 'Omar', nationalId: IQAMA, phone: '+966559999999' });

	for (const term of ['Sar', NATIONAL_ID.slice(0, 5), PHONE.slice(0, 8)]) {
		assert.deepEqual(
			(await api.tenant.search({ term })).map((match) => match.id),
			[sara.id],
			`expected "${term}" to reach the tenant`
		);
	}
});

// arabic is not a second-class locale: a name stored in it has to be reachable by typing it.
test('a tenant named in arabic is found by an arabic term', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'سارة الأحمد',
		nationalId: NATIONAL_ID,
		phone: PHONE
	});

	assert.deepEqual(
		(await api.tenant.search({ term: 'سارة' })).map((match) => match.id),
		[tenant.id]
	);
});

test('a search answers at most the number of records it was asked for', async () => {
	const api = await createApi();
	for (let index = 0; index < 4; index += 1) await seedTenant(api);

	assert.equal((await api.tenant.search({ term: 'Tenant', limit: 2 })).length, 2);
});
