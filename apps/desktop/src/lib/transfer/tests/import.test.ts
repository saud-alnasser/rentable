import assert from 'node:assert/strict';
import test from 'node:test';

import { toExportSheet } from '@rentable/design/csv.js';
import { type ImportField, isImportable, planImport, toImportIdentity } from '../import.ts';

/** the record every file here is read as: the three columns a tenant is made of. */
type Tenant = { name: string; nationalId: string; phone: string };

/** the tenant's own columns, which is the shape every import here takes. */
const fields: ImportField<Tenant>[] = [
	{ id: 'name', headers: ['name', 'الاسم'], required: true },
	{ id: 'nationalId', headers: ['national id', 'الهوية الوطنية'], required: true, identity: true },
	{ id: 'phone', headers: ['phone', 'الهاتف'], required: true, identity: true }
];

/** enough of a rule to tell a valid row from a broken one. */
const validate = (record: Tenant) =>
	/^[12]\d{9}$/.test(record.nationalId) ? undefined : 'national id is not valid';

function table(rows: string[][], headers = ['name', 'national id', 'phone']) {
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

// the other half of that rule, and the one that lets a file written for a person come back. A
// column a record is only *built* from leaves the file readable: it can still say which records
// it is about, and it is the rows rather than the file that cannot be acted on.
test('a file missing only a column a record is built from is still read', () => {
	const plan = planImport(
		fields,
		table([['1234567890', '+966512345678']], ['national id', 'phone']),
		validate
	);

	assert.deepEqual(plan.missingColumns, ['name']);
	assert.equal(plan.isUnreadable, false);
	assert.deepEqual(plan.rejected, [{ row: 2, reason: 'missing-value', detail: 'name' }]);
	assert.equal(isImportable(plan), false);
});

// and a row that names a record already here is answered before the file is asked whether it
// could build one: nothing is going to be created from it, so what else it says decides nothing.
test('a row already here is recognised even where the file could build nothing', () => {
	const plan = planImport(
		fields,
		table([['1234567890', '+966512345678']], ['national id', 'phone']),
		validate,
		new Set([toImportIdentity(['1234567890', '+966512345678'])])
	);

	assert.deepEqual(plan.rejected, [
		{ row: 2, reason: 'duplicate-of-existing', detail: '1234567890' }
	]);
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

/** a tenant as the directory exports one: its own columns, and a count that was on the row. */
type ExportedTenant = Tenant & { active: number };

// the other half of the round trip: what the directory writes out is what this reads back in.
// The file itself is Rust's on both sides — what is asserted here is that the columns the export
// declares are the columns the import finds, which is where a heading changed on one side and
// not the other would show up.
test('the sheet a directory exports plans back into the records it was given', () => {
	const columns = [
		{ header: 'name', value: (tenant: ExportedTenant) => tenant.name },
		{ header: 'national id', value: (tenant: ExportedTenant) => tenant.nationalId },
		{ header: 'phone', value: (tenant: ExportedTenant) => tenant.phone },
		// the counts the tenants export also writes, which an import does not read.
		{ header: 'active', value: (tenant: ExportedTenant) => String(tenant.active) }
	];
	const written = [
		{ name: 'Abby Kris', nationalId: '1234567890', phone: '+966512345678', active: 2 },
		{ name: 'محمد', nationalId: '1234567891', phone: '+966512345679', active: 0 }
	];

	// the file is what stands between the two: a workbook holds a cell as the kind of thing it
	// is, and the reader hands every one of them back as the text it renders to. Modelled here
	// rather than skipped, because a test that fed the sheet straight in would be asserting
	// against a shape no import ever sees.
	const read = toExportSheet(columns, written);
	const table = {
		headers: read.headers,
		rows: read.rows.map((row) => row.map((cell) => ('value' in cell ? String(cell.value) : '')))
	};

	const plan = planImport(fields, table, validate);

	assert.deepEqual(
		plan.create.map((held) => held.record),
		written.map(({ name, nationalId, phone }) => ({ name, nationalId, phone }))
	);
	assert.deepEqual(plan.rejected, []);
	assert.equal(isImportable(plan), true);
});
