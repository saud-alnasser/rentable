import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toTitleCase } from '../title-case.ts';

// ticket 28 of effort 832: a title is set in title case without raising a joining word, which
// the CSS `capitalize` could not do.
describe('toTitleCase', () => {
	it('raises the first letter of every word', () => {
		assert.equal(toTitleCase('delete contracts'), 'Delete Contracts');
	});

	it('leaves a joining word lower case between the first word and the last', () => {
		assert.equal(toTitleCase('link and code'), 'Link and Code');
		assert.equal(toTitleCase('import a workspace'), 'Import a Workspace');
		assert.equal(toTitleCase('change roles and permissions'), 'Change Roles and Permissions');
	});

	it('raises a joining word that opens or closes the title', () => {
		assert.equal(toTitleCase('a new member'), 'A New Member');
		assert.equal(toTitleCase('sign in'), 'Sign In');
	});

	it('keeps a letter that is already upper case', () => {
		assert.equal(toTitleCase('national ID'), 'National ID');
	});

	it('returns a script with no case unchanged', () => {
		assert.equal(toTitleCase('حذف العقود'), 'حذف العقود');
	});

	it('keeps the spacing it was handed', () => {
		assert.equal(toTitleCase(''), '');
		assert.equal(toTitleCase('  two  words '), '  Two  Words ');
	});
});
