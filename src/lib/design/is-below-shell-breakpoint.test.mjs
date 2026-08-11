import assert from 'node:assert/strict';
import test from 'node:test';
import { toNarrowerThanShellQuery } from './is-below-shell-breakpoint.svelte.ts';

test('keeps the declared unit rather than converting it to pixels', () => {
	assert.equal(toNarrowerThanShellQuery('48rem'), '(max-width: calc(48rem - 1px))');
});

test('tolerates the whitespace a custom property is read back with', () => {
	assert.equal(toNarrowerThanShellQuery(' 48rem '), '(max-width: calc(48rem - 1px))');
});

test('carries its own outer parentheses', () => {
	const query = toNarrowerThanShellQuery('48rem');

	assert.ok(query.startsWith('('), 'query must open with a parenthesis');
	assert.ok(query.endsWith(')'), 'query must close with a parenthesis');
});

test('refuses an absent declaration instead of returning a query that cannot match', () => {
	assert.throws(() => toNarrowerThanShellQuery(''), /--breakpoint-shell/);
	assert.throws(() => toNarrowerThanShellQuery('   '), /--breakpoint-shell/);
});
