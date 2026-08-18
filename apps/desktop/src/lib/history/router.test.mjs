import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApi, createFileApi, unusedId } from '$lib/api/testing.mjs';

/** A database that is a real file, and the way back to it once this one is done with. */
function workspaceFile() {
	const directory = mkdtempSync(path.join(tmpdir(), 'rentable-history-'));

	return {
		path: path.join(directory, 'workspace.db'),
		remove: () => rmSync(directory, { recursive: true, force: true })
	};
}

// the records these entries are about. Named rather than written inline: most of these tests
// turn on which record an entry belongs to, and an identity is unreadable at a glance where
// `1` and `2` were not.
const FIRST = unusedId();
const SECOND = unusedId();
const THIRD = unusedId();
const NEVER_WRITTEN_ABOUT = unusedId();

function entry(overrides = {}) {
	return {
		concept: 'contract',
		recordId: FIRST,
		action: 'created',
		record: 'CT-001',
		...overrides
	};
}

test('an entry is read back for the record it was written against', async () => {
	const api = await createApi();

	await api.history.append({ entries: [entry()] });

	const entries = await api.history.getMany({ concept: 'contract', recordId: FIRST });

	assert.equal(entries.length, 1);
	assert.equal(entries[0].action, 'created');
	assert.equal(entries[0].record, 'CT-001');
	assert.equal(entries[0].concept, 'contract');
});

test('and never for another record, or another kind of record with the same id', async () => {
	const api = await createApi();

	await api.history.append({ entries: [entry({ recordId: FIRST })] });
	await api.history.append({ entries: [entry({ recordId: SECOND, record: 'CT-002' })] });
	await api.history.append({
		entries: [entry({ concept: 'tenant', recordId: FIRST, record: 'Abby Kris' })]
	});

	const entries = await api.history.getMany({ concept: 'contract', recordId: FIRST });

	assert.deepEqual(
		entries.map((held) => held.record),
		['CT-001']
	);
});

test('entries are read most recent first', async () => {
	const api = await createApi();

	await api.history.append({ entries: [entry({ action: 'created' })] });
	await api.history.append({ entries: [entry({ action: 'edited' })] });
	await api.history.append({ entries: [entry({ action: 'terminated' })] });

	const entries = await api.history.getMany({ concept: 'contract', recordId: FIRST });

	// the clock is fixed, so all three carry the same instant — which is exactly the case the
	// tie-break on identity exists for.
	assert.deepEqual(
		entries.map((held) => held.action),
		['terminated', 'edited', 'created']
	);
});

// the criterion, and the reason this test needs a file: a history that is durable is durable or
// it is not, and the only way to tell is to stop reading the connection that wrote it.
test('the account survives a restart', async () => {
	const workspace = workspaceFile();

	const before = await createFileApi(workspace.path);

	try {
		await before.api.history.append({ entries: [entry({ action: 'created', record: 'CT-42' })] });
		await before.api.history.append({
			entries: [entry({ action: 'terminated', record: 'CT-42' })]
		});

		// closed, not merely abandoned: the application being started again is the criterion, and
		// a second reader over a connection still held open proves less than that.
		before.close();

		const after = await createFileApi(workspace.path);

		try {
			const entries = await after.api.history.getMany({ concept: 'contract', recordId: FIRST });

			assert.deepEqual(
				entries.map((held) => held.action),
				['terminated', 'created']
			);
			assert.equal(entries[0].record, 'CT-42');
		} finally {
			after.close();
		}
	} finally {
		workspace.remove();
	}
});

test('an entry carries when it happened, from the clock rather than the caller', async () => {
	const api = await createApi();

	await api.history.append({ entries: [entry()] });

	const [held] = await api.history.getMany({ concept: 'contract', recordId: FIRST });

	assert.equal(typeof held.at, 'number');
	assert.ok(held.at > 0);
});

// a mutation added later with an action this vocabulary does not carry must leave an entry that
// reads oddly rather than one that breaks the account.
test('an action outside the vocabulary is stored rather than refused', async () => {
	const api = await createApi();

	await api.history.append({ entries: [entry({ action: 'invented' })] });

	const [held] = await api.history.getMany({ concept: 'contract', recordId: FIRST });

	assert.equal(held.action, 'invented');
});

test('a record with no history answers with none rather than failing', async () => {
	const api = await createApi();

	assert.deepEqual(
		await api.history.getMany({ concept: 'contract', recordId: NEVER_WRITTEN_ABOUT }),
		[]
	);
});

/**
 * What the account costs on disk, which is the number retention would be argued from.
 *
 * Reported rather than asserted against a threshold: the effort puts retention out of scope, so
 * this exists to produce a figure and not to fail when the figure moves. The bound is generous
 * and only catches an order-of-magnitude change.
 */
test('the workspace grows by a reported amount per entry', async () => {
	const workspace = workspaceFile();
	const entries = 500;
	const opened = await createFileApi(workspace.path);

	try {
		const empty = statSync(workspace.path).size;

		const records = Array.from({ length: 50 }, () => unusedId());

		for (let index = 0; index < entries; index += 1) {
			await opened.api.history.append({
				entries: [entry({ recordId: records[index % 50], record: `CT-${index}`, action: 'edited' })]
			});
		}

		const filled = statSync(workspace.path).size;
		const perEntry = (filled - empty) / entries;

		console.log(
			`history: ${entries} entries grew the workspace by ${filled - empty} bytes ` +
				`(${perEntry.toFixed(1)} bytes each, ${empty} → ${filled})`
		);

		assert.ok(perEntry > 0, 'an entry has to cost something');
		assert.ok(perEntry < 500, `an entry cost ${perEntry.toFixed(1)} bytes, which is unexpected`);
	} finally {
		opened.close();
		workspace.remove();
	}
});

// a set is appended in one call, because an action over a selection leaves an entry per record
// and a round trip each is what that would cost the moment there is a wire here.
test('a set of entries is appended together, one per record', async () => {
	const api = await createApi();

	await api.history.append({
		entries: [
			entry({ recordId: FIRST, record: 'CT-1', action: 'terminated' }),
			entry({ recordId: SECOND, record: 'CT-2', action: 'terminated' }),
			entry({ recordId: THIRD, record: 'CT-3', action: 'terminated' })
		]
	});

	for (const [label, recordId] of [
		['CT-1', FIRST],
		['CT-2', SECOND],
		['CT-3', THIRD]
	]) {
		const held = await api.history.getMany({ concept: 'contract', recordId });

		assert.deepEqual(
			held.map((each) => each.record),
			[label],
			`${label} carries its own entry and nobody else's`
		);
	}
});

test('a search narrows an account to the changes it names', async () => {
	const api = await createApi();

	await api.history.append({
		entries: [
			entry({ action: 'created', record: 'CT-1' }),
			entry({ action: 'terminated', record: 'CT-1' })
		]
	});

	const narrowed = await api.history.getMany({
		concept: 'contract',
		recordId: FIRST,
		search: 'terminat'
	});

	assert.deepEqual(
		narrowed.map((held) => held.action),
		['terminated']
	);
});
