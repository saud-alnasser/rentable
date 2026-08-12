import assert from 'node:assert/strict';
import test from 'node:test';

import { toCsv } from './csv.ts';

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
