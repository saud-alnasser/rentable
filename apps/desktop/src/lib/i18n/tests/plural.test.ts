import assert from 'node:assert/strict';
import { test } from 'node:test';

import en from '$lib/i18n/en';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadAllLocales } from '$lib/i18n/i18n-util.sync';

// ticket 28 of effort 832: a count reads as a real plural in english, "1 member" and "103
// contracts", through typesafe-i18n's `{{singular|plural}}` form. "(s)" is the shortcut that form
// replaces, so no english string may carry it.

loadAllLocales();

/** every leaf of a translation tree, keyed by its dotted path. */
function leaves(tree: object, prefix = ''): Record<string, string> {
	const out: Record<string, string> = {};

	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;

		if (value && typeof value === 'object') {
			Object.assign(out, leaves(value, path));
		} else {
			out[path] = String(value);
		}
	}

	return out;
}

test('no english string writes a plural as "(s)"', () => {
	const shortcuts = Object.entries(leaves(en))
		.filter(([, value]) => value.includes('(s)'))
		.map(([key, value]) => `${key}: ${value}`);

	assert.deepEqual(
		shortcuts,
		[],
		`english strings with "(s)". Use {{singular|plural}} instead:\n${shortcuts.join('\n')}`
	);
});

test('an english count agrees with its number', () => {
	const t = i18nObject('en');

	assert.equal(t.layout.workspaceMenu.members({ count: 1 }), '1 member');
	assert.equal(t.layout.workspaceMenu.members({ count: 3 }), '3 members');
	assert.equal(t.dashboard.sections.contractCount({ count: 103 }), '103 contracts');
	assert.equal(t.common.table.results({ count: 1 }), '1 result');
	assert.equal(t.common.table.results({ count: 5000 }), '5,000 results');
	assert.equal(t.common.deleteDialog.blockedUnits({ count: 1 }), '1 unit belongs to it');
	assert.equal(t.common.deleteDialog.blockedUnits({ count: 2 }), '2 units belong to it');
});
