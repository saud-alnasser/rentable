import assert from 'node:assert/strict';
import test from 'node:test';

import { appRouter } from '../router.ts';
import { caller, context } from '../trpc.ts';
import { createMemoryDatabase } from './memory.ts';
import { mapRows } from './mod.ts';

async function createApi() {
	const db = createMemoryDatabase();
	const ctx = await context({ db, clock: { now: () => 0 }, host: {} });

	return caller(appRouter)(ctx);
}

test('a procedure runs end-to-end against a fresh in-memory database', async () => {
	const api = await createApi();

	const created = await api.tenant.create({
		name: 'Sara',
		nationalId: '1234567890',
		phone: '+966551234567'
	});

	assert.equal(created.name, 'Sara');
	assert.equal(created.nationalId, '1234567890');
	assert.ok(created.id > 0);

	const fetched = await api.tenant.get({ id: created.id });
	assert.deepEqual(fetched, created);
});

test('each in-memory database starts empty and isolated from the last', async () => {
	const api = await createApi();

	const fetched = await api.tenant.get({ id: 1 });

	assert.equal(fetched, undefined);
});

test('a domain rule enforced in a procedure rejects a duplicate national id', async () => {
	const api = await createApi();
	const tenant = {
		name: 'Sara',
		nationalId: '1234567890',
		phone: '+966551234567'
	};

	await api.tenant.create(tenant);

	await assert.rejects(
		() => api.tenant.create({ ...tenant, phone: '+966551234500' }),
		/national id/
	);
});

test('mapRows returns an empty result for a get that matched no rows', () => {
	assert.deepEqual(mapRows([], 'get'), {});
});

test('mapRows returns the first row values for a get', () => {
	const rows = [
		{ columns: ['id'], rows: [1] },
		{ columns: ['id'], rows: [2] }
	];

	assert.deepEqual(mapRows(rows, 'get'), { rows: [1] });
});

test('mapRows returns every row for a non-get method', () => {
	const rows = [
		{ columns: ['id'], rows: [1] },
		{ columns: ['id'], rows: [2] }
	];

	assert.deepEqual(mapRows(rows, 'all'), { rows: [[1], [2]] });
});
