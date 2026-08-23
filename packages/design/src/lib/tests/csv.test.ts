import assert from 'node:assert/strict';
import test from 'node:test';

import {
	toCsv,
	toExportFileName,
	toExportSheet,
	toNarrowedName,
	writeExport,
	type ExportSheet,
	type ExportWriter
} from '../csv.ts';

/** the tenant's own columns, which is the shape every export below is written from. */
type Tenant = { name: string; phone: string };

const columns = [
	{ header: 'name', value: (row: Tenant) => row.name },
	{ header: 'phone', value: (row: Tenant) => row.phone }
];

test('the file is the headers and then the rows, in the order they were given', () => {
	assert.equal(
		toCsv(columns, [
			{ name: 'Sara', phone: '+966551234567' },
			{ name: 'Omar', phone: '+966559999999' }
		]),
		'"Name","Phone"\r\n"Sara","+966551234567"\r\n"Omar","+966559999999"'
	);
});

test('a field carrying a comma, a quote or a newline survives it', () => {
	assert.equal(
		toCsv([{ header: 'note', value: (row) => row.note }], [{ note: 'a "big", tall\nplace' }]),
		'"Note"\r\n"a ""big"", tall\nplace"'
	);
});

// a spreadsheet reads a leading =, @, or a non-numeric + or - as the start of a formula.
test('a field a spreadsheet would run as a formula is shown instead', () => {
	const name = [{ header: 'name', value: (row: { name: string }) => row.name }];

	assert.equal(toCsv(name, [{ name: '=cmd()' }]), '"Name"\r\n"\'=cmd()"');
	assert.equal(toCsv(name, [{ name: '@sum(1)' }]), '"Name"\r\n"\'@sum(1)"');
	assert.equal(toCsv(name, [{ name: '-cmd()' }]), '"Name"\r\n"\'-cmd()"');
});

// every tenant's phone begins with a plus, and a guard that mangled it would be worse than
// the formula it was defending against.
test('a phone number keeps the plus it is written with', () => {
	assert.equal(
		toCsv([{ header: 'phone', value: (row) => row.phone }], [{ phone: '+966551234567' }]),
		'"Phone"\r\n"+966551234567"'
	);
});

test('a list with no rows is still a file with its headings', () => {
	assert.equal(toCsv(columns, []), '"Name","Phone"');
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
	{ header: 'name', value: (record: Tenant) => record.name },
	{ header: 'phone', value: (record: Tenant) => record.phone }
];

test('a sheet carries the headers in the order the columns were declared', () => {
	const sheet = toExportSheet(sheetColumns, []);

	assert.deepEqual(sheet.headers, ['Name', 'Phone']);
	assert.deepEqual(sheet.rows, []);
});

test('and one row per record, each cell in its column', () => {
	const sheet = toExportSheet(sheetColumns, [
		{ name: 'Abby Kris', phone: '+966512345678' },
		{ name: 'محمد', phone: '+966598765432' }
	]);

	assert.deepEqual(sheet.rows, [
		[
			{ kind: 'text', value: 'Abby Kris' },
			{ kind: 'text', value: '+966512345678' }
		],
		[
			{ kind: 'text', value: 'محمد' },
			{ kind: 'text', value: '+966598765432' }
		]
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

	assert.deepEqual(sheet.rows, [
		[{ kind: 'text', value: '=cmd()' }],
		[{ kind: 'text', value: 'a, b' }],
		[{ kind: 'text', value: 'he said "hello"' }]
	]);
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

/** the tenant as the round trip below writes one: the three columns the file carries. */
type IdentifiedTenant = { name: string; nationalId: string; phone: string };

// the half of the round trip that lives on this side. The reader that takes this file back off
// disk is in Rust and cannot call `toCsv`, so both suites assert against the same literal —
// there, `a_delimited_file_the_export_wrote_reads_back_as_the_row_it_was_given`. Change one and
// the other fails, which is what makes the pair a round trip rather than two opinions.
test('a row is written as the bytes the reader is pinned to', () => {
	const columns = [
		{ header: 'name', value: (tenant: IdentifiedTenant) => tenant.name },
		{ header: 'national id', value: (tenant: IdentifiedTenant) => tenant.nationalId },
		{ header: 'phone', value: (tenant: IdentifiedTenant) => tenant.phone }
	];

	assert.equal(
		toCsv(columns, [{ name: '=cmd()', nationalId: '1234567890', phone: '+966512345678' }]),
		'"Name","National Id","Phone"\r\n"\'=cmd()","1234567890","+966512345678"'
	);
});

// --- What a narrowed file is called ---------------------------------------------------
//
// A file of five thousand tenants and a file of the nine picked out of it are the same name
// otherwise, and the second replaces the first unless the reader notices.

test('a file that nothing narrowed keeps the plain name', () => {
	assert.equal(toNarrowedName('tenants', []), 'tenants');
});

test('and what narrowed it follows the name, in the order it was given', () => {
	assert.equal(toNarrowedName('tenants', ['sara', 'last month']), 'tenants (sara, last month)');
});

test('and a narrowing that says nothing is dropped rather than shown empty', () => {
	assert.equal(toNarrowedName('tenants', ['', '   ', 'sara']), 'tenants (sara)');
});

// a selection is one more narrowing, applied to a name a list has already narrowed once.
test('and a name already narrowed can be narrowed again', () => {
	assert.equal(toNarrowedName('tenants (sara)', ['9 selected']), 'tenants (sara) (9 selected)');
});

// WRITING
//
// The three things this module cannot do for itself. The writer below is the seam's second
// adapter: it records what it was asked to do rather than doing any of it, which is what lets
// these assert that the composed file reached the right one of the two calls.

/** a writer that answers every call and remembers it. */
function recordingWriter(chosen: string | null = '/home/reader/tenants.csv') {
	const asked: string[] = [];
	let text: string | null = null;
	let workbook: ExportSheet[] | null = null;

	const writer: ExportWriter = {
		chooseFile: (suggested) => {
			asked.push(suggested);

			return Promise.resolve(chosen);
		},
		writeText: (path, contents) => {
			text = contents;

			return Promise.resolve(path);
		},
		writeWorkbook: (path, sheets) => {
			workbook = sheets;

			return Promise.resolve(path);
		}
	};

	return {
		writer,
		asked,
		written: () => ({ text, workbook })
	};
}

const request = {
	name: 'tenants',
	columns,
	records: [{ name: 'Sara', phone: '+966551234567' }]
};

test('the dialog is opened on the name the list gave, carrying the chosen format', async () => {
	const { writer, asked } = recordingWriter();

	await writeExport(writer, { ...request, format: 'xlsx' });

	assert.deepEqual(asked, ['tenants.xlsx']);
});

test('a delimited export reaches the text writer and never the workbook one', async () => {
	const { writer, written } = recordingWriter();

	const path = await writeExport(writer, { ...request, format: 'csv' });

	assert.equal(path, '/home/reader/tenants.csv');
	assert.equal(written().text, toCsv(columns, request.records));
	assert.equal(written().workbook, null);
});

test('a workbook export reaches the workbook writer, as one sheet with no tab name', async () => {
	const { writer, written } = recordingWriter('/home/reader/tenants.xlsx');

	await writeExport(writer, { ...request, format: 'xlsx' });

	assert.equal(written().text, null);
	assert.deepEqual(written().workbook, [toExportSheet(columns, request.records)]);
});

// walking away from the dialog is not a failed export: nothing was written and there is nothing
// to tell anybody, which is why it comes back as nothing rather than as a throw.
test('a reader who walks away from the dialog is written nothing at all', async () => {
	const { writer, written } = recordingWriter(null);

	const path = await writeExport(writer, { ...request, format: 'csv' });

	assert.equal(path, null);
	assert.equal(written().text, null);
	assert.equal(written().workbook, null);
});
