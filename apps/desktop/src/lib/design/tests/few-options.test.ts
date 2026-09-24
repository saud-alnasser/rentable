// Pins the field-kind map's first row in [[rules/interface]] *Field kinds*: a choice of four or
// fewer takes a toggle group, the way Apple's guidelines give a few mutually exclusive options a
// segmented control, and never a select that hides all but one of them behind a press.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

/** the most options a choice may have and still be a toggle group rather than a select. */
const FEW = 4;

type SelectFound = {
	/** the options written out one by one, outside any loop. */
	written: number;
	/** the expression of every `{#each}` the options are drawn from. */
	drawnFrom: string[];
};

/**
 * every `Select.Root` in one component's source, with what its options are made of.
 *
 * A select's options are either written out, which this counts, or drawn from a list in an
 * `{#each}`, whose length a scan of the source cannot know. A drawn select is named in
 * `DRAWN_ALLOWED` below with why its list is not a few, so a new one is a decision somebody
 * wrote down rather than one the scan let through.
 */
function selectsIn(source: string): SelectFound[] {
	const found: SelectFound[] = [];

	for (const [block] of source.matchAll(/<Select\.Root\b[\s\S]*?<\/Select\.Root>/g)) {
		const drawnFrom = [...block.matchAll(/\{#each\s+([^}]+?)\s+as\b/g)].map((match) => match[1]);
		const outsideLoops = block.replace(/\{#each\b[\s\S]*?\{\/each\}/g, '');
		const written = [...outsideLoops.matchAll(/<Select\.Item\b/g)].length;

		found.push({ written, drawnFrom });
	}

	return found;
}

/** a select whose written-out options number `FEW` or fewer and are drawn from no list. */
function fewOptionSelects(source: string) {
	return selectsIn(source).filter(
		({ written, drawnFrom }) => drawnFrom.length === 0 && written <= FEW
	);
}

/**
 * the selects whose options are drawn from a list, and why that list is not a few.
 *
 * Each is a row of the field-kind map other than the first: a list of records, or the country half
 * of a phone, which the map names a select because the list is the countries the application can
 * dial and grows as they are added.
 */
const DRAWN_ALLOWED = [
	{
		label: 'lib/organization/component/offer-ownership.svelte',
		drawnFrom: 'accounts',
		why: 'another record: every account the organization could be handed to'
	},
	{
		label: 'lib/tenant/component/form.svelte',
		drawnFrom: 'PHONE_COUNTRY_OPTIONS',
		why: 'a phone: the map gives its country half a select'
	}
];

function toPosix(path: string) {
	return path.split(sep).join('/');
}

// every component under `src/`, labelled from there. A `tests/` directory is left out: it covers
// the rule rather than obeying it.
function components() {
	return readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'))
		.map((entry) => {
			const file = join(entry.parentPath, entry.name);
			return { file, label: toPosix(relative(SRC_ROOT, file)) };
		})
		.filter(({ label }) => !label.split('/').includes('tests'));
}

describe('a choice of four or fewer', () => {
	it('is caught by the scan when it is written as a select', () => {
		const two = `
			<Select.Root type="single">
				<Select.Trigger>{label}</Select.Trigger>
				<Select.Content>
					<Select.Item value="member" label="member">member</Select.Item>
					<Select.Item value="administrator" label="administrator">administrator</Select.Item>
				</Select.Content>
			</Select.Root>`;
		const five = two.replace(
			'</Select.Content>',
			'<Select.Item value="c" /><Select.Item value="d" /><Select.Item value="e" /></Select.Content>'
		);

		assert.equal(fewOptionSelects(two).length, 1);
		assert.equal(fewOptionSelects(five).length, 0);
		assert.deepEqual(selectsIn('{#each LEVELS as level}').length, 0);
		assert.deepEqual(
			selectsIn(
				'<Select.Root>{#each LEVELS as level (level)}<Select.Item value={level} />{/each}</Select.Root>'
			),
			[{ written: 0, drawnFrom: ['LEVELS'] }]
		);
	});

	it('is never a select in the application', () => {
		const offenders = components().flatMap(({ file, label }) =>
			fewOptionSelects(readFileSync(file, 'utf8')).map(({ written }) => ({ label, written }))
		);

		assert.deepEqual(
			offenders,
			[],
			'a choice of four or fewer takes a toggle group ([[rules/interface]], *Field kinds*)'
		);
	});

	it('is never hidden behind a list the scan cannot count', () => {
		const drawn = components().flatMap(({ file, label }) =>
			selectsIn(readFileSync(file, 'utf8')).flatMap(({ drawnFrom }) =>
				drawnFrom.map((from) => ({ label, drawnFrom: from }))
			)
		);

		for (const allowed of DRAWN_ALLOWED) {
			assert.ok(
				drawn.some(
					({ label, drawnFrom }) => label === allowed.label && drawnFrom === allowed.drawnFrom
				),
				`allowlisted select no longer exists: ${allowed.label} ${allowed.drawnFrom}`
			);
		}

		const unexplained = drawn.filter(
			({ label, drawnFrom }) =>
				!DRAWN_ALLOWED.some((allowed) => allowed.label === label && allowed.drawnFrom === drawnFrom)
		);

		assert.deepEqual(
			unexplained,
			[],
			'a select drawn from a list says in DRAWN_ALLOWED why the list is more than four'
		);
	});
});
