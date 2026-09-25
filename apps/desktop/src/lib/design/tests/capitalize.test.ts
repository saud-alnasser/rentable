// Ticket 28 of effort 832: no text transform changes what a person typed or what the words are.
//
// The CSS `capitalize` raises the first letter of every word. On a fixed word or two from the
// locale that is the title case every title here wears, and harmless. On a person's own value it
// turns a workspace named "default" into "Default", and on a title with a joining word in it, it
// writes "This Machine And Turso". So it stays only where the text is known: a title that can
// carry a joining word goes through `toTitleCase` (`@rentable/design/title-case.js`), and a
// settings heading is sentence case (`first-letter:uppercase`).
//
// `packages/design/src/lib/tests/capitalize.test.ts` holds the package to the same rule. Each
// package scans its own tree and neither reaches across.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SRC_ROOT, sourceFiles } from '#tests/source.ts';

/** the class itself, and not `autocapitalize` or a word that merely contains it. */
const CAPITALIZE = /(?<![\w-])capitalize(?![\w-])/g;

/**
 * Where `capitalize` may stay, how many times at most, and why. Each reason says what the text
 * is: fixed words from the locale, none of them a joining word and none of them a person's.
 */
const ALLOWED: readonly { label: string; most: number; reason: string }[] = [
	{
		label: 'lib/complex/component/form.svelte',
		most: 2,
		reason: 'the units heading and the submit, "units", "update" or "create"'
	},
	{ label: 'lib/complex/unit/component/form.svelte', most: 1, reason: 'the submit verb' },
	{ label: 'lib/tenant/component/form.svelte', most: 1, reason: 'the submit verb' },
	{ label: 'lib/payment/component/form.svelte', most: 1, reason: 'the submit verb' },
	{ label: 'lib/workspace/component/rename-form.svelte', most: 1, reason: 'the submit verb' },
	{
		label: 'lib/contract/component/form.svelte',
		most: 2,
		reason: 'the interval names ("monthly", "semi-annual") and the submit verb'
	},
	{
		label: 'lib/dashboard/component/landing.svelte',
		most: 3,
		reason: 'the period filter: its name and its four periods ("this month", "last year")'
	},
	{
		label: 'lib/dashboard/component/section.svelte',
		most: 1,
		reason: 'a rank heading: "overdue", "owing" or "ending soon"'
	},
	{
		label: 'lib/design/block/list.svelte',
		most: 4,
		reason: 'a filter’s name and options (rank and period), and the "export" and "import" rows'
	},
	{ label: 'lib/design/cell/status.svelte', most: 1, reason: 'a status name, one word' },
	{
		label: 'lib/history/component/record-history.svelte',
		most: 1,
		reason: 'what happened to the record: "created", "units changed", "restored"'
	},
	{
		label: 'lib/layout/component/account-menu.svelte',
		most: 2,
		reason: '"settings" and "sign out"'
	},
	{
		label: 'lib/layout/component/account-signed-out.svelte',
		most: 2,
		reason: '"sign in" and "settings"'
	},
	{
		label: 'lib/layout/component/breadcrumb.svelte',
		most: 2,
		reason: 'a place’s name from the route, never a record’s'
	},
	{ label: 'lib/layout/component/frame.svelte', most: 1, reason: '"search"' },
	{
		label: 'lib/layout/component/sidebar.svelte',
		most: 2,
		reason: 'the navigation’s place names, one word each'
	},
	{ label: 'lib/layout/component/workspace-menu.svelte', most: 1, reason: '"workspaces"' },
	{
		label: 'lib/organization/component/member-role.svelte',
		most: 1,
		reason: 'the role names, "member" and "administrator", for both member sheets'
	},
	{ label: 'lib/organization/component/role-table.svelte', most: 2, reason: 'the role names' },
	{
		label: 'lib/settings/component/appearance.svelte',
		most: 1,
		reason: '"system", "light" and "dark"'
	},
	{
		label: 'lib/settings/component/locale.svelte',
		most: 2,
		reason: 'the language names, which are the locale metadata’s'
	},
	{
		label: 'lib/workspace/component/import-dialog.svelte',
		most: 1,
		reason: 'a concept’s name, "tenants" or "contracts"'
	}
];

/** the source with its comments taken out: a comment may name the class it explains. */
function withoutComments(text: string) {
	return text
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '');
}

describe('capitalize', () => {
	it('sits only where the allowlist says, and no more often', () => {
		const offenders = sourceFiles().flatMap(({ file, label }) => {
			const count = [...withoutComments(readFileSync(file, 'utf8')).matchAll(CAPITALIZE)].length;
			const allowed = ALLOWED.find((entry) => entry.label === label)?.most ?? 0;

			return count > allowed ? [`${label}: ${count}, allowed ${allowed}`] : [];
		});

		assert.deepEqual(
			offenders,
			[],
			'a title that can carry a joining word takes toTitleCase; a person’s value takes no transform'
		);
	});

	it('names only files that exist, each with its reason', () => {
		for (const entry of ALLOWED) {
			assert.ok(existsSync(join(SRC_ROOT, entry.label)), `no such file: ${entry.label}`);
			assert.ok(entry.reason.trim().length > 0, `${entry.label} gives no reason`);
		}
	});
});
