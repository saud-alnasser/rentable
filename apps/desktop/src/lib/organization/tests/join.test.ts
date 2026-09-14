import assert from 'node:assert/strict';
import test from 'node:test';

import {
	afterConnect,
	beginWith,
	inspectionFailed,
	joinBegun,
	joinFailed,
	linkArrived,
	linkKind,
	normalizeLink,
	takeArrivingLink,
	THE_WALL
} from '$lib/organization/join.ts';
import type { JoinStep } from '$lib/organization/join.ts';
import type { LinkFacts } from '$lib/platform/host.ts';

/**
 * THE CONNECT SCREEN, DRIVEN
 *
 * Every step the screen can be in, reached without a window. What is worth pinning is the two
 * ways a link arrives ending in the same place, the two kinds of link ending in their own place,
 * the four refusals, and that the screen never holds more than the text and what the link said.
 *
 * An organization link ends at the wall, which is the startup unit's and is driven in
 * `layout/tests/startup.test.ts`; here it is `THE_WALL`, which is what the route acts on.
 */

const facts = (overrides: Partial<LinkFacts> = {}): LinkFacts => ({
	organizationId: 'acme',
	organizationName: 'Acme Rentals',
	remoteUrl: 'libsql://acme.turso.io',
	standing: 'none',
	invitation: null,
	...overrides
});

const LINK = 'rentable://join/abc';

/** the landing of a link that stays on this screen, narrowed for the assertions that read it. */
const stepOf = (overrides: Partial<LinkFacts>): JoinStep => {
	const landing = afterConnect(LINK, facts(overrides));

	assert.notEqual(landing, THE_WALL, 'expected a step rather than the wall');

	return landing as JoinStep;
};

test('a link handed over by the operating system and a pasted one start the same way', () => {
	assert.deepEqual(beginWith(LINK), {
		kind: 'inspecting',
		link: LINK
	});
	assert.deepEqual(beginWith(null), { kind: 'paste' });
	assert.deepEqual(beginWith('   '), { kind: 'paste' });
});

// a link pasted out of a chat or a mail client arrives wrapped; what a link is, is Rust's to say,
// and only the wrapping is taken off here.
test('a pasted link loses the wrapping a client put around it, and nothing inside it', () => {
	assert.equal(normalizeLink('  <rentable://join/abc>  '), LINK);
	assert.equal(normalizeLink('"rentable://join/abc".'), LINK);
	assert.equal(normalizeLink('rentable://join/a-b_c'), 'rentable://join/a-b_c');
	assert.equal(normalizeLink('not a link'), 'not a link');
});

// effort 826, requirement 10: one field takes both, and which kind it is, is read from the link.
// The standing is the test and the invited username is not: a link already opened carries a half
// whose secret opens nothing any more, and it is still an invitation link.
test('the standing says which kind of link this is', () => {
	assert.equal(linkKind(facts()), 'organization');
	assert.equal(
		linkKind(facts({ standing: 'open', invitation: { username: 'olivia' } })),
		'invitation'
	);
	assert.equal(linkKind(facts({ standing: 'consumed' })), 'invitation');
	assert.equal(linkKind(facts({ standing: 'lapsed' })), 'invitation');
	assert.equal(linkKind(facts({ standing: 'revoked' })), 'invitation');
});

test('an organization link ends this screen at the wall', () => {
	assert.equal(afterConnect(LINK, facts()), THE_WALL);
});

test('an invitation that stands names the organization and the person, and asks for a password', () => {
	assert.deepEqual(
		afterConnect(LINK, facts({ standing: 'open', invitation: { username: 'olivia' } })),
		{
			kind: 'password',
			link: LINK,
			organizationName: 'Acme Rentals',
			username: 'olivia',
			isJoining: false,
			errorMessage: null
		}
	);
});

// the secret in an open invitation's half opens one vault, and one that opens none names nobody.
// The step still stands: the accept is what refuses it, and the person has nothing else to try.
test('an open invitation whose secret opens nothing still asks, naming nobody', () => {
	const step = stepOf({ standing: 'open' });

	assert.equal(step.kind, 'password');
	assert.equal(step.kind === 'password' && step.username, '');
});

test('a lapsed, consumed or revoked invitation is refused by name', () => {
	for (const [standing, refusal] of [
		['lapsed', 'lapsed'],
		['consumed', 'consumed'],
		['revoked', 'revoked']
	] as const) {
		assert.deepEqual(afterConnect(LINK, facts({ standing })), {
			kind: 'refused',
			link: LINK,
			refusal,
			message: null
		});
	}
});

test('text that is not a link is unreadable, and an organization that cannot be reached says so', () => {
	const describe = (error: unknown) => (error as { message: string }).message;

	assert.deepEqual(
		inspectionFailed('nope', { code: 'invalidInput', message: 'not a link' }, describe),
		{
			kind: 'unreadable',
			link: 'nope'
		}
	);
	assert.deepEqual(
		inspectionFailed(LINK, { code: 'network', message: 'Acme could not be reached' }, describe),
		{ kind: 'unreachable', link: LINK, message: 'Acme could not be reached' }
	);
	// a failure with no code is still shown as what it said, rather than swallowed.
	assert.deepEqual(inspectionFailed(LINK, new Error('the disk is full'), describe), {
		kind: 'unreachable',
		link: LINK,
		message: 'the disk is full'
	});
});

// effort 826, requirement 3 of effort 824 still: a machine holds one organization, so a link for
// another is refused where the connect meets it, with the shell's sentence naming both.
test('a link for another organization is the fourth refusal, carrying what the shell said', () => {
	const describe = (error: unknown) => (error as { message: string }).message;

	assert.deepEqual(
		inspectionFailed(
			LINK,
			{
				code: 'preconditionFailed',
				message: 'this machine already holds Beta; disconnect it before connecting another'
			},
			describe
		),
		{
			kind: 'refused',
			link: LINK,
			refusal: 'anotherOrganization',
			message: 'this machine already holds Beta; disconnect it before connecting another'
		}
	);
});

test('the accept holds the fields while it runs, and says what refused it', () => {
	const joining = joinBegun(stepOf({ standing: 'open', invitation: { username: 'olivia' } }));

	assert.deepEqual(joining, {
		kind: 'password',
		link: LINK,
		organizationName: 'Acme Rentals',
		username: 'olivia',
		isJoining: true,
		errorMessage: null
	});

	assert.deepEqual(
		joinFailed(
			joining,
			new Error('the invitation was already opened'),
			(error) => (error as Error).message
		),
		{
			kind: 'password',
			link: LINK,
			organizationName: 'Acme Rentals',
			username: 'olivia',
			isJoining: false,
			errorMessage: 'the invitation was already opened'
		}
	);
});

// neither transition has anything to say about a step that is not the password's: a corner back
// pressed while the accept was out leaves the field as it was.
test('the accept transitions leave every other step alone', () => {
	assert.deepEqual(joinBegun({ kind: 'paste' }), { kind: 'paste' });
	assert.deepEqual(
		joinFailed({ kind: 'unreadable', link: 'nope' }, new Error('anything'), () => 'said'),
		{ kind: 'unreadable', link: 'nope' }
	);
});

test('an arriving link is taken once, and a second replaces a first nobody opened', () => {
	assert.equal(takeArrivingLink(), null);

	linkArrived('rentable://join/first');
	linkArrived('rentable://join/second');

	assert.equal(takeArrivingLink(), 'rentable://join/second');
	assert.equal(takeArrivingLink(), null);
});
