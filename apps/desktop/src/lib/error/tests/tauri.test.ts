import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	TAURI_ERROR_CODES,
	TAURI_REFUSAL_REASONS,
	isTauriError,
	toTauriErrorCode,
	toTauriRefusalReason
} from '$lib/error/tauri';
import { appRouter } from '$lib/api/router.ts';
import { caller, context } from '$lib/api/trpc.ts';
import { PASSWORD_FLOOR, refusalAfterFailedConnect } from '$lib/organization/setup.ts';
import { createMemoryDatabase } from '$lib/platform/database/memory.ts';
import { fakeHost } from '$lib/platform/tests/testing.ts';
import { TRPCError } from '@trpc/server';

test('a rejected command payload is recognised by its code and message', () => {
	assert.equal(isTauriError({ code: 'busy', message: 'a sync is already running' }), true);
});

test('every code the rust surface can send is recognised', () => {
	for (const code of TAURI_ERROR_CODES) {
		assert.equal(isTauriError({ code, message: 'x' }), true, `unrecognised code: ${code}`);
	}
});

test('a payload carrying an unknown code is not a tauri error', () => {
	assert.equal(isTauriError({ code: 'teapot', message: 'x' }), false);
});

test('a payload missing the message is not a tauri error', () => {
	assert.equal(isTauriError({ code: 'busy' }), false);
});

test('values that never crossed the boundary are not tauri errors', () => {
	for (const value of [null, undefined, 'busy', new Error('busy'), {}, []]) {
		assert.equal(isTauriError(value), false, `wrongly recognised: ${String(value)}`);
	}
});

test('the code is read off a rejected command payload', () => {
	assert.equal(toTauriErrorCode({ code: 'integrity', message: 'hash mismatch' }), 'integrity');
});

test('an error raised inside typescript has no code', () => {
	assert.equal(toTauriErrorCode(new Error('a sync is already running')), null);
});

/**
 * Effort 832, requirement 23: **the reasons are one list, declared in Rust and mirrored here.** The
 * enum is read back out of `error.rs` and each variant spelled the way serde spells it, so a
 * reason added on one side and not the other fails here rather than reaching a screen as
 * the generic sentence.
 */
test('the reasons this side knows are exactly the ones rust declares', async () => {
	const rust = await readFile(
		fileURLToPath(new URL('../../../../tauri/src/error.rs', import.meta.url)),
		'utf8'
	);
	const body = /pub enum RefusalReason \{([\s\S]*?)\n\}/.exec(rust)?.[1];

	assert.ok(body, 'error.rs no longer declares RefusalReason');

	const declared = body
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => /^[A-Z][A-Za-z]*,$/.test(line))
		.map((line) => line[0]!.toLowerCase() + line.slice(1, -1));

	assert.deepEqual(declared, [...TAURI_REFUSAL_REASONS]);
});

// effort 828, requirement 1: a link refused on its own standing carries which standing beside its
// message, so the connect screen names it without reading the sentence. Since effort 832 every
// refusal a person can cause in the shell does.
test('a refusal says which reason refused it', () => {
	for (const reason of TAURI_REFUSAL_REASONS) {
		assert.equal(
			toTauriRefusalReason({ code: 'refused', reason, message: 'the invitation has lapsed' }),
			reason
		);
	}
});

test('nothing but a refused carries a reason, and an unknown word is no reason at all', () => {
	assert.equal(toTauriRefusalReason({ code: 'forbidden', message: 'the code is wrong' }), null);
	assert.equal(toTauriRefusalReason({ code: 'refused', reason: 'burnt', message: 'x' }), null);
	assert.equal(toTauriRefusalReason({ code: 'refused', message: 'x' }), null);
	assert.equal(toTauriRefusalReason(new Error('the invitation has lapsed')), null);
});

// effort 832, the premise of ticket 19: a refusal Rust raises is read off a call that went through
// a procedure, not only off a call made straight to the shell. tRPC wraps anything thrown inside a
// procedure that is not its own error, so what reaches the caller is an `INTERNAL_SERVER_ERROR`
// whose `cause` holds the payload Rust rejected with. The code and the reason are read from there.
test('a rejection from the host survives a procedure, and its code is read off the cause', async () => {
	const rejected = {
		code: 'refused',
		reason: 'anotherOrganizationHeld',
		message: 'this machine already holds Acme; disconnect it before connecting another'
	};
	const host = fakeHost({
		organization: {
			...fakeHost().organization,
			connectExisting: async () => {
				throw rejected;
			}
		}
	});
	const api = caller(appRouter)(
		await context({ db: createMemoryDatabase(), clock: { now: () => 0 }, host, identity: null })
	);

	const failure = await api.app.organization
		.connectExisting({ username: 'owner', password: 'x'.repeat(PASSWORD_FLOOR) })
		.then(
			() => assert.fail('the procedure should have been refused'),
			(error: unknown) => error
		);

	// what tRPC does to it, pinned so a change in the library shows up here first.
	assert.ok(failure instanceof TRPCError);
	assert.equal(failure.code, 'INTERNAL_SERVER_ERROR');
	assert.equal(isTauriError(failure), false);
	assert.equal((failure.cause as unknown as { code: string }).code, 'refused');

	// and what this side reads regardless.
	assert.equal(toTauriErrorCode(failure), 'refused');
	assert.equal(toTauriRefusalReason(failure), 'anotherOrganizationHeld');
	assert.equal(refusalAfterFailedConnect(failure)?.step, 'connect');
});

test('a refused link keeps its reason through a procedure', async () => {
	const failure = new TRPCError({
		code: 'INTERNAL_SERVER_ERROR',
		cause: { code: 'refused', reason: 'lapsed', message: 'the invitation has lapsed' }
	});

	assert.equal(toTauriErrorCode(failure), 'refused');
	assert.equal(toTauriRefusalReason(failure), 'lapsed');
});
