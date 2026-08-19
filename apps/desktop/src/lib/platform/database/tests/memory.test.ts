import assert from 'node:assert/strict';
import test from 'node:test';

import { appRouter } from '$lib/api/router.ts';
import { caller, context } from '$lib/api/trpc.ts';
import { fakeHost } from '$lib/platform/tests/testing.ts';
import { isRecordId, newId } from '../identity.ts';
import { createMemoryDatabase } from '../memory.ts';
import { mapRows } from '../client.ts';
import * as s from '../schema.ts';

async function createApi() {
	const db = createMemoryDatabase();
	const ctx = await context({ db, clock: { now: () => 0 }, host: fakeHost() });

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
	assert.ok(isRecordId(created.id));

	const fetched = await api.tenant.get({ id: created.id });
	assert.deepEqual(fetched, created);
});

test('each in-memory database starts empty and isolated from the last', async () => {
	const api = await createApi();

	const fetched = await api.tenant.get({ id: newId() });

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

// this client claims to run a batch inside a transaction "as the Rust layer does", and a write
// that must not half-apply is built on that claim (ADR 0027). It is checked here because the
// claim is what makes a router test over a batch mean anything.

test('a batch that fails part way leaves nothing of itself behind', async () => {
	const db = createMemoryDatabase();

	await assert.rejects(() =>
		db.batch([
			db.insert(s.complex).values({ id: newId(), name: 'Palm Court', location: 'Riyadh' }),
			// the second statement takes a name the first just took, and complex names are unique
			// in the schema rather than only in the router.
			db.insert(s.complex).values({ id: newId(), name: 'Palm Court', location: 'Jeddah' })
		])
	);

	assert.deepEqual(await db.select().from(s.complex), []);
});

test('a batch that succeeds commits every statement in it', async () => {
	const db = createMemoryDatabase();

	await db.batch([
		db.insert(s.complex).values({ id: newId(), name: 'Palm Court', location: 'Riyadh' }),
		db.insert(s.complex).values({ id: newId(), name: 'Coral Tower', location: 'Jeddah' })
	]);

	assert.deepEqual((await db.select().from(s.complex)).map((complex) => complex.name).sort(), [
		'Coral Tower',
		'Palm Court'
	]);
});
