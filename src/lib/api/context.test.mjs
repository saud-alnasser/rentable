import assert from 'node:assert/strict';
import test from 'node:test';

import { context } from './context.ts';

test('context carries the database, clock, and host it is given', async () => {
	const db = { marker: 'db' };
	const clock = { now: () => 42 };
	const host = { marker: 'host' };

	const ctx = await context({ db, clock, host });

	assert.equal(ctx.db, db);
	assert.equal(ctx.clock, clock);
	assert.equal(ctx.host, host);
});

test('context carries exactly the three ambient members', async () => {
	const ctx = await context({ db: {}, clock: { now: () => 0 }, host: {} });

	assert.deepEqual(Object.keys(ctx).sort(), ['clock', 'db', 'host']);
});

test('an omitted clock defaults to the system clock', async () => {
	const before = Date.now();
	const ctx = await context({ db: {}, host: {} });
	const now = ctx.clock.now();
	const after = Date.now();

	assert.equal(typeof now, 'number');
	assert.ok(now >= before && now <= after, 'clock.now() reports the current wall-clock time');
});
