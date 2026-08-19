import assert from 'node:assert/strict';
import test from 'node:test';

import { withExtension } from '../path.ts';

test('a chosen path that already carries the extension is left exactly as it is', () => {
	assert.equal(withExtension('/home/abby/tenants.csv', 'csv'), '/home/abby/tenants.csv');
	assert.equal(
		withExtension('C:\\Users\\Abby\\Desktop\\workspace.xlsx', 'xlsx'),
		'C:\\Users\\Abby\\Desktop\\workspace.xlsx'
	);
});

// the dialog on Windows puts the extension back by itself; GTK's hands back whatever was typed.
test('a chosen path the reader left the extension off gets it back', () => {
	assert.equal(withExtension('/home/abby/tenants', 'csv'), '/home/abby/tenants.csv');
	assert.equal(
		withExtension('C:\\Users\\Abby\\workspace', 'xlsx'),
		'C:\\Users\\Abby\\workspace.xlsx'
	);
});

// what the reader typed is their spelling of the same extension, and appending a second one
// would hand them `tenants.CSV.csv`.
test('the extension is recognised whatever case it was typed in', () => {
	assert.equal(withExtension('/home/abby/tenants.CSV', 'csv'), '/home/abby/tenants.CSV');
	assert.equal(withExtension('/home/abby/tenants.csv', 'CSV'), '/home/abby/tenants.csv');
});

// a name that ends in something else is not a name that ends in this one: the file has to be
// openable, and `tenants.2026` is a name the reader chose rather than an extension.
test('a different extension is added to rather than replaced', () => {
	assert.equal(withExtension('/home/abby/tenants.xlsx', 'csv'), '/home/abby/tenants.xlsx.csv');
	assert.equal(withExtension('/home/abby/tenants.2026', 'csv'), '/home/abby/tenants.2026.csv');
});

// only the file's own name is looked at. A folder with a dot in it says nothing about the file
// inside it, and reading the whole path would leave that file with no extension at all.
test('a dot in a directory above the file is not the file having an extension', () => {
	assert.equal(
		withExtension('/home/abby/Q1.2026/tenants', 'csv'),
		'/home/abby/Q1.2026/tenants.csv'
	);
	assert.equal(
		withExtension('C:\\Users\\Abby\\Q1.2026\\tenants', 'xlsx'),
		'C:\\Users\\Abby\\Q1.2026\\tenants.xlsx'
	);
});

test('a path is untouched where there is no extension to carry', () => {
	assert.equal(withExtension('/home/abby/tenants', ''), '/home/abby/tenants');
});
