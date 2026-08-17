import assert from 'node:assert/strict';
import test from 'node:test';

import { createApi, monthsFromNow, NOW } from '$lib/api/testing.mjs';
import { formatLocaleNumber } from '$lib/platform/locale.ts';
import { foldSearchText } from '$lib/platform/database/search.ts';
import * as s from '$lib/platform/database/schema.ts';

const PHONE = '+966551234567';

let sequence = 0;

// A tenant with a chosen name and an identity nobody else in the file holds, so a fixture
// never fails on a uniqueness constraint rather than on what it is asserting.
async function seedNamed(api, name) {
	sequence += 1;
	const suffix = String(sequence).padStart(4, '0');

	return api.tenant.create({
		name,
		nationalId: `1${suffix}00000`.slice(0, 10),
		phone: `+96655${suffix}000`.slice(0, 13)
	});
}

async function seedContract(api, { cost, govId }) {
	const tenant = await seedNamed(api, `Tenant ${cost}`);

	return api.contract.create({
		govId,
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '1m',
		cost
	});
}

const ids = (matches) => matches.map((match) => match.id);

// -- the folding itself -------------------------------------------------------------------

// The table is applied to a term here and to a column in SQL, and the whole fix is that the
// two agree — so what it reduces each kind of text to is pinned on its own, where a failure
// names the substitution rather than the surface that noticed.
test('folding reduces each kind of text to one form', () => {
	const cases = [
		['١٥٠٠', '1500', 'Arabic-Indic digits'],
		['١٬٥٠٠', '1500', 'a number as ar-SA renders it'],
		['1,500', '1500', 'a number as en-GB renders it'],
		['١٥٠٠٫٥', '1500.5', 'the Arabic decimal separator'],
		['أحمد', 'احمد', 'hamza above'],
		['إحمد', 'احمد', 'hamza below'],
		['آحمد', 'احمد', 'maddah'],
		['ٱحمد', 'احمد', 'wasla'],
		['فاطمة', 'فاطمه', 'taa marbuta'],
		['اـحـمـد', 'احمد', 'tatweel'],
		['أَحْمَد', 'احمد', 'harakat'],
		['احمد', 'احمد', 'text already in the folded form'],
		['50%_\\', '50%_\\', 'the wildcards and the escape character, which folding never touches']
	];

	for (const [written, expected, what] of cases) {
		assert.equal(foldSearchText(written), expected, what);
	}
});

// The pattern is folded before it is escaped, which is only safe because no substitution
// reads or writes any of those three characters — asserted rather than assumed.
test('folding is idempotent, so applying it to a folded value changes nothing', () => {
	for (const written of ['١٬٥٠٠', 'أَحْمـد', 'فاطمة', 'Sara Ahmed']) {
		const folded = foldSearchText(written);

		assert.equal(foldSearchText(folded), folded, written);
	}
});

// -- what the screen shows ----------------------------------------------------------------

// `ar-SA` renders every number in Arabic-Indic digits and `en-GB` groups them with a comma,
// and neither of those spellings is what the column holds. A reader types what they can see.
test('a number is found as either locale renders it', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 1500, govId: 'C-1' });
	await seedContract(api, { cost: 99, govId: 'C-2' });

	const arabic = formatLocaleNumber('ar', 1500);
	const english = formatLocaleNumber('en', 1500);

	assert.equal(arabic, '١٬٥٠٠', 'the fixture no longer matches what ar-SA renders');
	assert.equal(english, '1,500', 'the fixture no longer matches what en-GB renders');

	assert.deepEqual(ids(await api.contract.getMany({ search: arabic })), [contract.id]);
	assert.deepEqual(ids(await api.contract.getMany({ search: english })), [contract.id]);
	assert.deepEqual(ids(await api.contract.getMany({ search: '1500' })), [contract.id]);
});

test('a payment is found by an amount written in Arabic-Indic digits', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 1500, govId: 'P-1' });
	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: NOW,
		amount: 1500
	});

	assert.deepEqual(
		ids(await api.contract.payments.getMany({ contractId: contract.id, search: '١٥٠٠' })),
		[payment.id]
	);
});

test('a tenant is found by an identity written in Arabic-Indic digits', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Sara',
		nationalId: '1234567890',
		phone: PHONE
	});

	assert.deepEqual(ids(await api.tenant.search({ term: '١٢٣٤٥٦٧٨٩٠' })), [tenant.id]);
	assert.deepEqual(ids(await api.tenant.getMany({ search: '١٢٣٤٥٦٧٨٩٠' })), [tenant.id]);
});

// -- Arabic orthography -------------------------------------------------------------------

// أ إ آ ٱ ا are one letter as far as a name is concerned, and which one a record was entered
// with is not something the person looking for it knows.
test('an alef variant on either side finds the same name', async () => {
	const api = await createApi();
	const hamzated = await seedNamed(api, 'أحمد');
	const bare = await seedNamed(api, 'احمد');
	const madda = await seedNamed(api, 'آحمد');

	const expected = [bare.id, hamzated.id, madda.id].sort();

	for (const term of ['أحمد', 'احمد', 'آحمد', 'إحمد', 'ٱحمد']) {
		assert.deepEqual(
			ids(await api.tenant.search({ term })).sort(),
			expected,
			`searching ${term} did not reach every spelling of the name`
		);
	}
});

test('diacritics and tatweel on either side change nothing about what matches', async () => {
	const api = await createApi();
	// stored with a fatha, a sukun and a tatweel — decoration a reader never types.
	const decorated = await seedNamed(api, 'أَحْمـد');

	assert.deepEqual(ids(await api.tenant.search({ term: 'احمد' })), [decorated.id]);

	const plain = await seedNamed(api, 'احمد');

	// and the same in reverse: the decoration is on the term and the record is plain.
	assert.deepEqual(
		ids(await api.tenant.search({ term: 'أَحْمـد' })).sort(),
		[decorated.id, plain.id].sort()
	);
});

test('a taa marbuta is found written either way', async () => {
	const api = await createApi();
	const marbuta = await seedNamed(api, 'فاطمة');
	const haa = await seedNamed(api, 'فاطمه');

	const expected = [haa.id, marbuta.id].sort();

	assert.deepEqual(ids(await api.tenant.search({ term: 'فاطمة' })).sort(), expected);
	assert.deepEqual(ids(await api.tenant.search({ term: 'فاطمه' })).sort(), expected);
});

// A folded term is only half the fix, and the wrong half: nothing is folded on the way in, so
// the record keeps the spelling it was entered with and the surface shows it back unchanged.
// This is also what makes a record written before the folding shipped findable by it — a row
// written then and a row written now are the same bytes.
test('folding a search does not fold what is stored', async () => {
	const api = await createApi();
	const tenant = await seedNamed(api, 'أَحْمد');

	assert.equal(tenant.name, 'أَحْمد');
	assert.equal((await api.tenant.get({ id: tenant.id })).name, 'أَحْمد');
});

// -- the comparisons that were three ------------------------------------------------------

// Every search reaches the same comparison, so the folding is asserted once per surface
// rather than trusted to have been wired into each.
test('every list and the palette fold the same way', async () => {
	const api = await createApi();
	const tenant = await seedNamed(api, 'أحمد');
	const complex = await api.complex.create({
		name: 'برج أحمد',
		location: 'أحمد street',
		units: [{ name: 'وحدة أحمد' }]
	});
	const contract = await api.contract.create({
		govId: 'أحمد-1',
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '1m',
		cost: 1500
	});

	const term = 'احمد';

	assert.deepEqual(ids(await api.tenant.search({ term })), [tenant.id], 'palette: tenants');
	assert.deepEqual(ids(await api.tenant.getMany({ search: term })), [tenant.id], 'list: tenants');
	assert.deepEqual(ids(await api.complex.search({ term })), [complex.id], 'palette: complexes');
	assert.deepEqual(
		ids(await api.complex.getMany({ search: term })),
		[complex.id],
		'list: complexes'
	);
	assert.equal((await api.complex.units.search({ term })).length, 1, 'palette: units');
	assert.equal(
		(await api.complex.units.getMany({ complexId: complex.id, search: term })).length,
		1,
		'list: units'
	);
	assert.deepEqual(ids(await api.contract.search({ term })), [contract.id], 'palette: contracts');
	assert.deepEqual(
		ids(await api.contract.getMany({ search: term })),
		[contract.id],
		'list: contracts'
	);
	assert.equal(
		(await api.contract.units.getAssignableMany({ contractId: contract.id, search: term })).length,
		1,
		'the assignable units picker'
	);
});

// -- the wildcard guard -------------------------------------------------------------------

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
		ids(await api.tenant.search({ term: '50%' })),
		[literal.id],
		'a percent sign matched every row instead of the text it stands for'
	);
	assert.deepEqual(await api.tenant.search({ term: '5_%' }), []);
	assert.deepEqual(
		ids(await api.tenant.getMany({ search: '50%' })),
		[literal.id],
		'the directory let a percent sign act as a wildcard'
	);
	assert.deepEqual(await api.tenant.getMany({ search: '5_%' }), []);
});

test('a wildcard is still escaped by the contract and payment searches', async () => {
	const api = await createApi();
	const contract = await seedContract(api, { cost: 1500, govId: '50% up front' });
	await seedContract(api, { cost: 99, govId: 'paid in full' });

	assert.deepEqual(ids(await api.contract.getMany({ search: '50%' })), [contract.id]);

	const payment = await api.contract.payments.create({
		contractId: contract.id,
		date: NOW,
		amount: 1500
	});

	assert.deepEqual(
		ids(await api.contract.payments.getMany({ contractId: contract.id, search: '%' })),
		[],
		'a bare percent matched every payment instead of the text it stands for'
	);
	assert.deepEqual(
		ids(await api.contract.payments.getMany({ contractId: contract.id, search: '1500' })),
		[payment.id]
	);
});

test('a search ignores case in both directions', async () => {
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Sara Ahmed',
		nationalId: '1234567890',
		phone: PHONE
	});

	assert.deepEqual(ids(await api.tenant.search({ term: 'SARA' })), [tenant.id]);
});

// A multi-column search is several `or`s, and `and` binds tighter than `or` in SQL — so a
// bare chain of them dropped into a narrowing `and` reads as `(narrow and first) or rest`
// and returns rows the narrowing excluded. The ledger is where that shows: the term has to
// match a column *after* the first for the narrowing to be the thing dropped, which is why
// this searches by the day rather than by the amount.
test('a ledger search stays inside the contract it is reading', async () => {
	const api = await createApi();
	const read = await seedContract(api, { cost: 1500, govId: 'READ' });
	const other = await seedContract(api, { cost: 2500, govId: 'OTHER' });

	const mine = await api.contract.payments.create({
		contractId: read.id,
		date: NOW,
		amount: 1500
	});
	await api.contract.payments.create({ contractId: other.id, date: NOW, amount: 2500 });

	const month = new Date(NOW).toISOString().slice(0, 7);

	assert.deepEqual(
		ids(await api.contract.payments.getMany({ contractId: read.id, search: month })),
		[mine.id],
		'the search reached payments belonging to another contract'
	);
});

// the same shape one surface over: the contracts a tenant holds, searched.
test('a searched contract list stays inside the tenant it was narrowed to', async () => {
	const api = await createApi();
	const tenant = await seedNamed(api, 'Reem');
	const other = await seedNamed(api, 'Noura');

	const hers = await api.contract.create({
		govId: 'HERS',
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '1m',
		cost: 1500
	});
	await api.contract.create({
		govId: 'THEIRS',
		tenantId: other.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '1m',
		cost: 1500
	});

	// `1500` reaches the cost, which is the last column the search spans — the position where
	// an unparenthesised `or` drops the narrowing that came before it.
	assert.deepEqual(
		ids(await api.contract.getMany({ tenantId: tenant.id, search: '1500' })),
		[hers.id],
		'the search reached contracts held by another tenant'
	);
});

// The stored side is folded only where folding it could change the value, which is what keeps
// the comparison from spending 31 substitutions per column per row on values that cannot hold
// any of them. The saving is only sound while the reasons behind each exemption hold, so each
// reason is asserted rather than trusted: a numeric column, an all-ASCII enum, and — the one
// nothing in the schema module can prove on its own — a text column whose validator refuses
// anything else.

test('every column declared ASCII-only has a validator that refuses a foldable character', () => {
	// The declaration is safe *because* the write path enforces it. If a validator is ever
	// loosened, this fails here rather than as a record nobody can find months later.
	const refusals = [
		['nationalId', s.TenantSchema.shape.nationalId, '١٢٣٤٥٦٧٨٩٠'],
		['phone', s.TenantSchema.shape.phone, '+٩٦٦٥٠١٢٣٤٥٦٧']
	];

	assert.equal(
		refusals.length,
		s.ASCII_ONLY_COLUMNS.length,
		'a column was declared ASCII-only without a test that its validator enforces it'
	);

	for (const [name, field, arabicIndic] of refusals) {
		assert.equal(
			field.safeParse(arabicIndic).success,
			false,
			`${name} accepted a value its ASCII-only declaration says it cannot hold`
		);
		// and the ASCII spelling of the same value is what it does accept, so the refusal above
		// is about the script rather than about the pattern rejecting everything.
		assert.equal(field.safeParse(foldSearchText(arabicIndic)).success, true);
	}
});

test('every enum a search spans holds only text that folding leaves alone', () => {
	// An enum is exempted by checking its members rather than by assuming them, so one that
	// gains a non-ASCII member starts folding again on its own. This asserts the premise that
	// makes today's exemption correct.
	for (const column of [s.contract.status, s.contract.interval, s.unit.status]) {
		for (const member of column.enumValues) {
			assert.equal(
				foldSearchText(member),
				member,
				`${column.name} holds ${member}, which folding changes`
			);
		}
	}
});

test('skipping the stored fold changes nothing about what is found', async () => {
	// The behavioural claim the optimisation rests on. Every one of these terms reaches a
	// column whose stored side is no longer folded — a real, an integer, an enum, and the two
	// declared text columns — and each still finds its record from either spelling.
	const api = await createApi();
	const tenant = await api.tenant.create({
		name: 'Nadia',
		nationalId: '1234567890',
		phone: '+966501234567'
	});
	const contract = await api.contract.create({
		govId: 'SKIP-1',
		tenantId: tenant.id,
		start: monthsFromNow(-1),
		end: monthsFromNow(11),
		interval: '1m',
		cost: 1500
	});
	const found = async (search) => ids(await api.contract.getMany({ search }));

	assert.deepEqual(await found('1500'), [contract.id], 'a real column');
	assert.deepEqual(await found('١٥٠٠'), [contract.id], 'a real column, typed in Arabic-Indic');
	assert.deepEqual(await found('1,500'), [contract.id], 'a real column, typed with a separator');
	assert.deepEqual(await found(String(tenant.id)), [contract.id], 'an integer column');
	assert.deepEqual(await found('active'), [contract.id], 'an enum column');
	assert.deepEqual(await found('1m'), [contract.id], 'the interval enum');

	assert.deepEqual(
		ids(await api.tenant.getMany({ search: '1234567890' })),
		[tenant.id],
		'a declared ASCII-only column'
	);
	assert.deepEqual(
		ids(await api.tenant.getMany({ search: '١٢٣٤٥٦٧٨٩٠' })),
		[tenant.id],
		'a declared ASCII-only column, reached by folding the term alone'
	);
	assert.deepEqual(
		ids(await api.tenant.getMany({ search: '+٩٦٦٥٠١٢٣٤٥٦٧' })),
		[tenant.id],
		'the phone column, reached by folding the term alone'
	);
});
