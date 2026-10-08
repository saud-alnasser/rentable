import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';

import * as s from '$lib/platform/database/schema';

import {
	createApiWithoutUniqueRules,
	monthsFromNow,
	refusalReadIn,
	refusedWith
} from '$lib/app/tests/testing.ts';
import { getContractRenewalTerm } from '$lib/contract/renewal/renewal.ts';
import { contractsHoldingGovId } from '$lib/contract/row.ts';
import { seedContract } from '$lib/contract/tests/seed.ts';

// --- A contract's government ID, kept unique by the app --------------------------------------
//
// Effort 857, requirement 14: the shared database no longer holds a rule on a contract's
// government ID, so two machines saving one apart lose no record. A person saving online still
// meets today's words, because every act writing a contract reads the workspace before it
// writes. Every test here runs over a workspace with the rules dropped.

const TAKEN_AR = 'المعرف الحكومي مرتبط بعقد آخر.';
const TAKEN_EN = 'government ID is associated with another contract.';

test('creating a contract with a government ID another holds is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await seedContract(api, { govId: 'GOV-1' });
	const create = () => seedContract(api, { govId: '  GOV-1  ' });

	await assert.rejects(create, refusedWith('contract.govIdTaken'));
	assert.equal(await refusalReadIn(create, 'ar'), TAKEN_AR);
	assert.equal(await refusalReadIn(create, 'en'), TAKEN_EN);
	assert.deepEqual(
		(await api.contract.getMany({})).map((contract) => contract.govId),
		['GOV-1']
	);
});

test('editing a contract to another’s government ID is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	await seedContract(api, { govId: 'GOV-1' });
	const other = await seedContract(api, { govId: 'GOV-2' });
	const edit = (govId: string) =>
		api.contract.update({
			id: other.id,
			tenantId: other.tenantId,
			govId,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost: 1000
		});

	await assert.rejects(() => edit('GOV-1'), refusedWith('contract.govIdTaken'));
	assert.equal(await refusalReadIn(() => edit('GOV-1'), 'ar'), TAKEN_AR);
	assert.equal(await refusalReadIn(() => edit('GOV-1'), 'en'), TAKEN_EN);
	assert.equal((await api.contract.get({ id: other.id }))?.govId, 'GOV-2');

	// its own government ID is not another's.
	assert.equal((await edit('GOV-2')).govId, 'GOV-2');
});

test('renewing into a government ID another holds is refused in today’s words', async () => {
	const { api } = await createApiWithoutUniqueRules();
	const contract = await seedContract(api, { govId: 'GOV-1' });
	const term = getContractRenewalTerm(contract);
	const renew = () =>
		api.contract.renew({
			contractId: contract.id,
			start: term.start.getTime(),
			end: term.end.getTime(),
			govId: 'GOV-1'
		});

	await assert.rejects(renew, refusedWith('contract.govIdTaken'));
	assert.equal(await refusalReadIn(renew, 'ar'), TAKEN_AR);
	assert.equal(await refusalReadIn(renew, 'en'), TAKEN_EN);
});

test('putting contracts back under a government ID since taken is refused by name', async () => {
	const { api } = await createApiWithoutUniqueRules();
	const contract = await seedContract(api, { govId: 'GOV-1' });
	const deleted = await api.contract.deleteMany({ ids: [contract.id] });

	await seedContract(api, { govId: 'GOV-1' });

	const restore = () => api.contract.restoreMany({ contracts: deleted.deleted });

	await assert.rejects(restore, refusedWith('contract.govIdTakenNamed', { named: 'GOV-1' }));
	// the value named is isolated from the sentence around it, in either language, as `isolateDirection`
	// does for every value a reader did not write in their own direction.
	assert.equal(
		await refusalReadIn(restore, 'ar'),
		'المعرف الحكومي \u2068GOV-1\u2069 مرتبط بعقد آخر.'
	);
	assert.equal(
		await refusalReadIn(restore, 'en'),
		'government ID \u2068GOV-1\u2069 is associated with another contract.'
	);
});

// the one read every check above goes through, so what counts as holding a government ID is
// decided in one place: a record retired by a merge (ticket 35) is left out there, and no act
// changes.
test('the contracts holding a government ID are read in one place, leaving out the one being edited', async () => {
	const { api, db } = await createApiWithoutUniqueRules();
	const held = await seedContract(api, { govId: 'GOV-1' });

	assert.deepEqual(
		(await contractsHoldingGovId(db, ['GOV-1', 'GOV-2'])).map((contract) => contract.id),
		[held.id]
	);
	assert.deepEqual(await contractsHoldingGovId(db, ['GOV-1'], held.id), []);
	assert.deepEqual(await contractsHoldingGovId(db, []), []);
});

// two contracts can share a government ID saved apart on two machines (ticket 38). An edit
// leaving the ID alone is not refused over it, and an edit changing it to one held is.
test('editing a contract that shares a government ID with another, leaving the ID alone, saves', async () => {
	const { api, db } = await createApiWithoutUniqueRules();
	await seedContract(api, { govId: 'GOV-1' });
	const other = await seedContract(api, { govId: 'GOV-2' });

	await db.update(s.contract).set({ govId: 'GOV-1' }).where(eq(s.contract.id, other.id));

	const edit = (govId: string, cost: number) =>
		api.contract.update({
			id: other.id,
			tenantId: other.tenantId,
			govId,
			start: monthsFromNow(-1),
			end: monthsFromNow(11),
			interval: '12m',
			cost
		});

	assert.equal((await edit(' GOV-1 ', 1200)).cost, 1200);

	assert.equal((await edit('GOV-3', 1200)).govId, 'GOV-3');

	await assert.rejects(() => edit('GOV-1', 1200), refusedWith('contract.govIdTaken'));
	assert.equal(await refusalReadIn(() => edit('GOV-1', 1200), 'en'), TAKEN_EN);
});
