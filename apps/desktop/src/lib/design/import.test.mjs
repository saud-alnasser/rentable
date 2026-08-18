import assert from 'node:assert/strict';
import test from 'node:test';

import { toExportSheet } from './csv.ts';
import { isImportable, planImport, toImportIdentity } from './import.ts';

/** the tenant's own columns, which is the shape every import here takes. */
const fields = [
	{ id: 'name', headers: ['name', 'الاسم'], required: true },
	{ id: 'nationalId', headers: ['national id', 'الهوية الوطنية'], required: true, identity: true },
	{ id: 'phone', headers: ['phone', 'الهاتف'], required: true, identity: true }
];

/** enough of a rule to tell a valid row from a broken one. */
const validate = (record) =>
	/^[12]\d{9}$/.test(record.nationalId) ? undefined : 'national id is not valid';

function table(rows, headers = ['name', 'national id', 'phone']) {
	return { headers, rows };
}

test('a file becomes the records it names', () => {
	const plan = planImport(fields, table([['Abby Kris', '1234567890', '+966512345678']]), validate);

	assert.deepEqual(plan.create, [
		{ row: 2, record: { name: 'Abby Kris', nationalId: '1234567890', phone: '+966512345678' } }
	]);
	assert.deepEqual(plan.rejected, []);
	assert.equal(isImportable(plan), true);
});

// the heading is row one, so the first record is row two — which is what the reader is looking
// at in whatever opened the file.
test('a row is numbered as the file numbers it, heading included', () => {
	const plan = planImport(
		fields,
		table([
			['Abby Kris', '1234567890', '+966512345678'],
			['Bob Kris', '1234567891', '+966512345679']
		]),
		validate
	);

	assert.deepEqual(
		plan.create.map((held) => held.row),
		[2, 3]
	);
});

test('a file exported in arabic is the same file', () => {
	const plan = planImport(
		fields,
		table([['محمد', '1234567890', '+966512345678']], ['الاسم', 'الهوية الوطنية', 'الهاتف']),
		validate
	);

	assert.equal(plan.create.length, 1);
	assert.equal(plan.create[0].record.name, 'محمد');
});

// the export writes more columns than an import reads — the contract counts a tenant row shows
// are derived, and a file carrying them is still a file of tenants.
test('columns the concept does not read are ignored rather than refused', () => {
	const plan = planImport(
		fields,
		table(
			[['Abby Kris', '1234567890', '+966512345678', '0', '2']],
			['name', 'national id', 'phone', 'defaulted', 'active']
		),
		validate
	);

	assert.equal(plan.create.length, 1);
	assert.equal(isImportable(plan), true);
});

test('a file missing a column it needs is refused as a file, not row by row', () => {
	const plan = planImport(fields, table([['Abby Kris']], ['name']), validate);

	assert.deepEqual(plan.missingColumns, ['national id', 'phone']);
	assert.deepEqual(plan.create, []);
	assert.deepEqual(plan.rejected, []);
	assert.equal(isImportable(plan), false);
});

test('a row missing a value is rejected and named, and the rest still go in', () => {
	const plan = planImport(
		fields,
		table([
			['', '1234567890', '+966512345678'],
			['Bob Kris', '1234567891', '+966512345679']
		]),
		validate
	);

	assert.deepEqual(plan.rejected, [{ row: 2, reason: 'missing-value', detail: 'name' }]);
	assert.deepEqual(
		plan.create.map((held) => held.record.name),
		['Bob Kris']
	);
});

test('a row the concept refuses carries the reason the concept gave', () => {
	const plan = planImport(fields, table([['Abby Kris', 'nonsense', '+966512345678']]), validate);

	assert.deepEqual(plan.rejected, [
		{ row: 2, reason: 'invalid', detail: 'national id is not valid' }
	]);
});

test('a row duplicating a record that already exists is rejected, not collided', () => {
	const plan = planImport(
		fields,
		table([['Abby Kris', '1234567890', '+966512345678']]),
		validate,
		new Set([toImportIdentity(['1234567890', '+966512345678'])])
	);

	assert.equal(plan.rejected[0].reason, 'duplicate-of-existing');
	assert.deepEqual(plan.collisions, []);
	assert.deepEqual(plan.create, []);
});

// the criterion this ticket exists for. The reader assembled the file; the two rows claiming one
// identity are both theirs, and choosing between them is not something this can do quietly.
test('a file whose own rows collide is refused entirely, with both rows named', () => {
	const plan = planImport(
		fields,
		table([
			['Abby Kris', '1234567890', '+966512345678'],
			['Bob Kris', '1234567891', '+966512345679'],
			['Abby Again', '1234567890', '+966512345678']
		]),
		validate
	);

	assert.deepEqual(plan.collisions, [{ rows: [2, 4], identity: '1234567890' }]);
	assert.equal(isImportable(plan), false);
	// nothing is created, including the row that was fine — a file that contradicts itself is
	// refused as a file.
	assert.deepEqual(plan.create, []);
});

test('and a collision is reported however the two rows spell the identity', () => {
	const plan = planImport(
		fields,
		table([
			['Abby Kris', '1234567890', '+966512345678'],
			['Abby Again', ' 1234567890 ', '+966512345678']
		]),
		validate
	);

	assert.equal(plan.collisions.length, 1);
});

test('two records sharing only a name do not collide', () => {
	const plan = planImport(
		fields,
		table([
			['Abby Kris', '1234567890', '+966512345678'],
			['Abby Kris', '1234567891', '+966512345679']
		]),
		validate
	);

	assert.deepEqual(plan.collisions, []);
	assert.equal(plan.create.length, 2);
});

test('a file with nothing in it creates nothing and is not importable', () => {
	const plan = planImport(fields, table([]), validate);

	assert.deepEqual(plan.create, []);
	assert.equal(isImportable(plan), false);
});

test('a short row is treated as one missing its later values', () => {
	const plan = planImport(fields, table([['Abby Kris']]), validate);

	assert.deepEqual(plan.rejected, [{ row: 2, reason: 'missing-value', detail: 'national id' }]);
});

// the other half of the round trip: what the directory writes out is what this reads back in.
// The file itself is Rust's on both sides — what is asserted here is that the columns the export
// declares are the columns the import finds, which is where a heading changed on one side and
// not the other would show up.
test('the sheet a directory exports plans back into the records it was given', () => {
	const columns = [
		{ header: 'name', value: (tenant) => tenant.name },
		{ header: 'national id', value: (tenant) => tenant.nationalId },
		{ header: 'phone', value: (tenant) => tenant.phone },
		// the counts the tenants export also writes, which an import does not read.
		{ header: 'active', value: (tenant) => String(tenant.active) }
	];
	const written = [
		{ name: 'Abby Kris', nationalId: '1234567890', phone: '+966512345678', active: 2 },
		{ name: 'محمد', nationalId: '1234567891', phone: '+966512345679', active: 0 }
	];

	const plan = planImport(fields, toExportSheet(columns, written), validate);

	assert.deepEqual(
		plan.create.map((held) => held.record),
		written.map(({ name, nationalId, phone }) => ({ name, nationalId, phone }))
	);
	assert.deepEqual(plan.rejected, []);
	assert.equal(isImportable(plan), true);
});
