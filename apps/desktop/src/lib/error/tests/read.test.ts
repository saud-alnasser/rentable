import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readRecord, toReadFailure, type ReadResult } from '$lib/error/read';

/**
 * WHAT COUNTS AS A FAILED READ
 *
 * Ticket 03 of effort 861, requirement 1: a read that failed is drawn as a failure, never as a set
 * with nothing in it. The one place that decides it is `toReadFailure`, and it decides on the
 * query alone: failed where the read errored and holds nothing to show. A refetch that failed
 * while an earlier answer is held keeps the answer, and a read that succeeded with no rows is a
 * set with nothing in it, not a failure.
 */

/** a read in the shape a query result has, counting what asked for it again. */
function read(state: Pick<ReadResult, 'isError' | 'data'>) {
	const result = { ...state, refetches: 0, refetch: () => (result.refetches += 1) };

	return result;
}

test('a read that errored and holds no data failed', () => {
	assert.equal(toReadFailure(read({ isError: true, data: undefined })).failed, true);
});

test('a read that errored while it holds an earlier answer did not fail: the answer is kept', () => {
	assert.equal(toReadFailure(read({ isError: true, data: [{ id: 'tenant-1' }] })).failed, false);
});

test('a read that succeeded with no rows did not fail: it is a set with nothing in it', () => {
	assert.equal(toReadFailure(read({ isError: false, data: [] })).failed, false);
});

test('a read still on its way did not fail', () => {
	assert.equal(toReadFailure(read({ isError: false, data: undefined })).failed, false);
});

test('trying again runs the same read again', () => {
	const query = read({ isError: true, data: undefined });

	toReadFailure(query).retry();

	assert.equal(query.refetches, 1);
});

// ticket 04 of effort 861: a record that is not there is a read that answered, with nothing. The
// query client takes an answer of `undefined` for a failed read, so a record's read answers `null`.
test('a record read that answers with nothing answers null, so it is not found rather than failed', async () => {
	assert.equal(await readRecord(Promise.resolve(undefined)), null);
});

test('a record read that answers with the record answers it unchanged', async () => {
	const record = { id: 'tenant-1' };

	assert.equal(await readRecord(Promise.resolve(record)), record);
});

test('a record read that is refused stays refused, so it is drawn as failed', async () => {
	await assert.rejects(readRecord(Promise.reject(new Error('refused'))), /refused/);
});
