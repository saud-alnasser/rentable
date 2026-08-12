import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi } from '$lib/api/testing.mjs';

const PHONE = '+966551234567';

// `%` and `_` are LIKE's own wildcards. A term carrying either is the user's text, not a
// request to match everything — which is what the ESCAPE clause in the matcher is for.
test('a term carrying a wildcard is matched as the text it is', async () => {
	const api = await createApi();
	const literal = await api.tenant.create({
		name: '50% deposit',
		nationalId: '1234567890',
		phone: PHONE
	});
	await api.tenant.create({
		name: 'Sara',
		nationalId: '2345678901',
		phone: '+966559999999'
	});

	assert.deepEqual(
		(await api.tenant.search({ term: '50%' })).map((match) => match.id),
		[literal.id],
		'a percent sign matched every row instead of the text it stands for'
	);
	assert.deepEqual(await api.tenant.search({ term: '5_%' }), []);
});

test('a search ignores case in both directions', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Sara Ahmed',
		nationalId: '1234567890',
		phone: PHONE
	});

	assert.deepEqual(
		(await api.tenant.search({ term: 'SARA' })).map((match) => match.id),
		[tenant.id]
	);
});
