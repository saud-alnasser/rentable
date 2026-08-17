import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv, toExportFileName, toExportSheet } from './csv.ts';

const columns = [
	{ header: 'name', value: (row) => row.name },
	{ header: 'phone', value: (row) => row.phone }
];

test('the file is the headers and then the rows, in the order they were given', () => {
	assert.equal(
		toCsv(columns, [
			{ name: 'Sara', phone: '+966551234567' },
			{ name: 'Omar', phone: '+966559999999' }
		]),
		'"name","phone"\r\n"Sara","+966551234567"\r\n"Omar","+966559999999"'
	);
});

test('a field carrying a comma, a quote or a newline survives it', () => {
	assert.equal(
		toCsv([{ header: 'note', value: (row) => row.note }], [{ note: 'a "big", tall\nplace' }]),
		'"note"\r\n"a ""big"", tall\nplace"'
	);
});

// a spreadsheet reads a leading =, @, or a non-numeric + or - as the start of a formula.
test('a field a spreadsheet would run as a formula is shown instead', () => {
	const name = [{ header: 'name', value: (row) => row.name }];

	assert.equal(toCsv(name, [{ name: '=cmd()' }]), '"name"\r\n"\'=cmd()"');
	assert.equal(toCsv(name, [{ name: '@sum(1)' }]), '"name"\r\n"\'@sum(1)"');
	assert.equal(toCsv(name, [{ name: '-cmd()' }]), '"name"\r\n"\'-cmd()"');
});

// every tenant's phone begins with a plus, and a guard that mangled it would be worse than
// the formula it was defending against.
test('a phone number keeps the plus it is written with', () => {
	assert.equal(
		toCsv([{ header: 'phone', value: (row) => row.phone }], [{ phone: '+966551234567' }]),
		'"phone"\r\n"+966551234567"'
	);
});

test('a list with no rows is still a file with its headings', () => {
	assert.equal(toCsv(columns, []), '"name","phone"');
});

// arabic is not a second-class locale: a heading and a value in it come through untouched.
test('arabic text passes through unchanged', () => {
	assert.equal(
		toCsv([{ header: 'الاسم', value: (row) => row.name }], [{ name: 'سارة الأحمد' }]),
		'"الاسم"\r\n"سارة الأحمد"'
	);
});

// --- the workbook's rendering of the same columns -------------------------------------

const sheetColumns = [
	{ header: 'name', value: (record) => record.name },
	{ header: 'phone', value: (record) => record.phone }
];

test('a sheet carries the headers in the order the columns were declared', () => {
	const sheet = toExportSheet(sheetColumns, []);

	assert.deepEqual(sheet.headers, ['name', 'phone']);
	assert.deepEqual(sheet.rows, []);
});

test('and one row per record, each cell in its column', () => {
	const sheet = toExportSheet(sheetColumns, [
		{ name: 'Abby Kris', phone: '+966512345678' },
		{ name: 'محمد', phone: '+966598765432' }
	]);

	assert.deepEqual(sheet.rows, [
		['Abby Kris', '+966512345678'],
		['محمد', '+966598765432']
	]);
});

// a cell in an archive is not delimited by anything, so the quoting the csv writer does would
// put the quotes themselves in the cell. Defusing a formula is the writer's, where the format
// is known.
test('a sheet quotes nothing and defuses nothing — a cell is not a delimited field', () => {
	const sheet = toExportSheet(
		[{ header: 'value', value: (record) => record.value }],
		[{ value: '=cmd()' }, { value: 'a, b' }, { value: 'he said "hello"' }]
	);

	assert.deepEqual(sheet.rows, [['=cmd()'], ['a, b'], ['he said "hello"']]);
});

test('a file takes the extension of the format it was written as', () => {
	assert.equal(toExportFileName('contracts', 'csv'), 'contracts.csv');
	assert.equal(toExportFileName('contracts', 'xlsx'), 'contracts.xlsx');
});

// every list already names itself with `.csv`, from when that was the only format there was.
test('and a name that already carries one does not gain a second', () => {
	assert.equal(toExportFileName('contracts.csv', 'xlsx'), 'contracts.xlsx');
	assert.equal(toExportFileName('contracts.csv', 'csv'), 'contracts.csv');
	assert.equal(toExportFileName('العقود.csv', 'xlsx'), 'العقود.xlsx');
});

// the concept's own name is kept whatever is in it: a dot inside a name is not an extension.
test('a dot that is not an extension is left in the name', () => {
	assert.equal(toExportFileName('contracts.2026', 'csv'), 'contracts.2026.csv');
});
