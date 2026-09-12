import assert from 'node:assert/strict';
import test from 'node:test';

import {
	beginWith,
	inspected,
	inspectionFailed,
	linkArrived,
	normalizeLink,
	takeArrivingLink
} from '$lib/organization/join.ts';
import type { LinkFacts } from '$lib/platform/host.ts';

/**
 * THE JOIN SCREEN, DRIVEN
 *
 * Every step the screen can be in, reached without a window. What is worth pinning is the two
 * ways a link arrives ending in the same place, the four things a read link can be, and that the
 * screen never holds more than the text and the facts.
 */

const facts = (standing: LinkFacts['standing']): LinkFacts => ({
	organizationId: 'org-1',
	organizationName: 'Acme',
	remoteUrl: 'libsql://org-1.turso.io',
	standing
});

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

test('an open invitation asks for the password, and every other standing is refused by name', () => {
	assert.deepEqual(inspected('rentable://join/abc', facts('open')), {
		kind: 'password',
		link: 'rentable://join/abc',
		facts: facts('open')
	});

	for (const standing of ['lapsed', 'consumed', 'revoked'] as const) {
		const step = inspected('rentable://join/abc', facts(standing));

		assert.equal(step.kind, 'refused', standing);
		assert.equal(step.kind === 'refused' && step.facts.organizationName, 'Acme', standing);
	}
});

// requirement 6: the organization's own link is not a refusal but the way a place already held
// comes back on a machine, by the email and the password.
test("the organization's own link restores a place rather than refusing", () => {
	assert.deepEqual(inspected('rentable://join/abc', facts('none')), {
		kind: 'restore',
		link: 'rentable://join/abc',
		facts: facts('none')
	});
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
