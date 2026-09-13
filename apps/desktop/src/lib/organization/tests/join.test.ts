import assert from 'node:assert/strict';
import test from 'node:test';

import {
	beginWith,
	inspectionFailed,
	linkArrived,
	normalizeLink,
	takeArrivingLink
} from '$lib/organization/join.ts';

/**
 * THE CONNECT SCREEN, DRIVEN
 *
 * Every step the screen can be in, reached without a window. What is worth pinning is the two
 * ways a link arrives ending in the same place, the two ways a read can fail, and that the
 * screen never holds more than the text. A link that was read ends at the wall, which is the
 * startup unit's and is driven in `layout/tests/startup.test.ts`.
 */

test('a link handed over by the operating system and a pasted one start the same way', () => {
	assert.deepEqual(beginWith('rentable://join/abc'), {
		kind: 'inspecting',
		link: 'rentable://join/abc'
	});
	assert.deepEqual(beginWith(null), { kind: 'paste' });
	assert.deepEqual(beginWith('   '), { kind: 'paste' });
});

// a link pasted out of a chat or a mail client arrives wrapped; what a link is, is Rust's to say,
// and only the wrapping is taken off here.
test('a pasted link loses the wrapping a client put around it, and nothing inside it', () => {
	assert.equal(normalizeLink('  <rentable://join/abc>  '), 'rentable://join/abc');
	assert.equal(normalizeLink('"rentable://join/abc".'), 'rentable://join/abc');
	assert.equal(normalizeLink('rentable://join/a-b_c'), 'rentable://join/a-b_c');
	assert.equal(normalizeLink('not a link'), 'not a link');
});

test('text that is not a link is unreadable, and an organization that cannot be reached says so', () => {
	const describe = (error: unknown) => (error as { message: string }).message;

	assert.deepEqual(
		inspectionFailed('nope', { code: 'invalidInput', message: 'not a link' }, describe),
		{ kind: 'unreadable', link: 'nope' }
	);
	assert.deepEqual(
		inspectionFailed(
			'rentable://join/abc',
			{ code: 'network', message: 'Acme could not be reached' },
			describe
		),
		{ kind: 'unreachable', link: 'rentable://join/abc', message: 'Acme could not be reached' }
	);
	// a failure with no code is still shown as what it said, rather than swallowed.
	assert.deepEqual(
		inspectionFailed('rentable://join/abc', new Error('the disk is full'), describe),
		{ kind: 'unreachable', link: 'rentable://join/abc', message: 'the disk is full' }
	);
});

test('an arriving link is taken once, and a second replaces a first nobody opened', () => {
	assert.equal(takeArrivingLink(), null);

	linkArrived('rentable://join/first');
	linkArrived('rentable://join/second');

	assert.equal(takeArrivingLink(), 'rentable://join/second');
	assert.equal(takeArrivingLink(), null);
});
