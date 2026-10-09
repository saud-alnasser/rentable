import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readRecord, toReadFailure, toReadsFailure, type ReadResult } from '$lib/error/read';

/**
 * WHAT COUNTS AS A FAILED READ
 *
 * Ticket 03 of effort 861, requirement 1: a read that failed is drawn as a failure, never as a set
 * with nothing in it. The one place that decides it is `toReadFailure`, and it decides on the
 * query alone: failed where the read errored and holds nothing to show. A refetch that failed
 * while an earlier answer is held keeps the answer, and a read that succeeded with no rows is a
 * set with nothing in it, not a failure.
 */

/**
 * a read in the shape a query result has, counting what asked for it again. Not running, and with
 * its last answer the error it holds, if any, unless the test says otherwise.
 */
function read(
	state: Partial<Pick<ReadResult, 'isFetching' | 'errorUpdatedAt' | 'dataUpdatedAt'>> &
		Pick<ReadResult, 'isError' | 'data'>
) {
	const result = {
		isFetching: false,
		errorUpdatedAt: state.isError ? 2 : 0,
		dataUpdatedAt: state.data === undefined ? 0 : 1,
		...state,
		refetches: 0,
		refetch: () => (result.refetches += 1)
	};

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

// ticket 15 of effort 861: while a failed read runs again it is still the failed read, now trying.
// The query client puts a read that holds nothing back to pending while it runs, so it no longer
// errors; that its last answer was an error is what it keeps, and the run in flight is what says
// it is trying.
test('a failed read running again is still failed, and is retrying', () => {
	const failure = toReadFailure(
		read({ isError: false, data: undefined, isFetching: true, errorUpdatedAt: 2 })
	);

	assert.equal(failure.failed, true);
	assert.equal(failure.retrying, true);
});

test('a failed read that is not running again is not retrying', () => {
	assert.equal(toReadFailure(read({ isError: true, data: undefined })).retrying, false);
});

test('a first read on its way is neither failed nor retrying: it is loading', () => {
	const failure = toReadFailure(read({ isError: false, data: undefined, isFetching: true }));

	assert.equal(failure.failed, false);
	assert.equal(failure.retrying, false);
});

test('a read holding an earlier answer while it runs again after an error is not retrying', () => {
	const failure = toReadFailure(
		read({ isError: true, data: [{ id: 'tenant-1' }], isFetching: true, errorUpdatedAt: 2 })
	);

	assert.equal(failure.failed, false);
	assert.equal(failure.retrying, false);
});

// a read that failed once and answered since is not a failed read: its last answer was not the
// error. Run again holding nothing, it is loading, and saying it failed would be false.
test('a read that failed once and answered since, running again with nothing held, is loading', () => {
	const failure = toReadFailure(
		read({ isError: false, data: undefined, isFetching: true, errorUpdatedAt: 1, dataUpdatedAt: 2 })
	);

	assert.equal(failure.failed, false);
	assert.equal(failure.retrying, false);
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

// ticket 21 of effort 861: a surface drawn from several reads, the workspace page's state and its
// members, fails with any of them, and trying again runs each that failed.
test('several reads fail together where any one of them failed', () => {
	const answered = toReadFailure(read({ isError: false, data: [] }));
	const failed = toReadFailure(read({ isError: true, data: undefined }));

	assert.equal(toReadsFailure(answered, failed).failed, true);
	assert.equal(toReadsFailure(failed, answered).failed, true);
	assert.equal(toReadsFailure(answered, answered).failed, false);
});

test('several reads are retrying while one that failed runs again', () => {
	const answered = toReadFailure(read({ isError: false, data: [] }));
	const trying = toReadFailure(
		read({ isError: false, data: undefined, isFetching: true, errorUpdatedAt: 2 })
	);
	const failed = toReadFailure(read({ isError: true, data: undefined }));

	assert.equal(toReadsFailure(answered, trying).retrying, true);
	assert.equal(toReadsFailure(answered, failed).retrying, false);
});

test('trying several reads again runs each that failed, and not one that answered', () => {
	const answered = read({ isError: false, data: [] });
	const first = read({ isError: true, data: undefined });
	const second = read({ isError: true, data: undefined });

	toReadsFailure(toReadFailure(answered), toReadFailure(first), toReadFailure(second)).retry();

	assert.equal(answered.refetches, 0);
	assert.equal(first.refetches, 1);
	assert.equal(second.refetches, 1);
});
