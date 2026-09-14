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
	normalizeCode,
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
			codeRefusal: null,
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
		codeRefusal: null,
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
			codeRefusal: null,
			errorMessage: 'the invitation was already opened'
		}
	);
});

// effort 826, requirement 23: the two refusals a code gets are told apart by the code the shell
// rejected with, so the screen can name each in the reader's own language. A wrong code failed the
// seal and is `forbidden`; one the row says has lapsed is `preconditionFailed`. Everything else,
// including anything raised on this side, keeps the shell's own sentence and names nothing.
test('a wrong code and a lapsed one are told apart, and nothing else is read as either', () => {
	const joining = joinBegun(stepOf({ standing: 'open', invitation: { username: 'olivia' } }));
	const refusalOf = (error: unknown) => {
		const step = joinFailed(joining, error, () => 'said');

		return step.kind === 'password' ? step.codeRefusal : 'not the password step';
	};

	assert.equal(
		refusalOf({ code: 'forbidden', message: 'the code is wrong or has lapsed' }),
		'wrong'
	);
	assert.equal(refusalOf({ code: 'preconditionFailed', message: 'the code has lapsed' }), 'lapsed');
	assert.equal(refusalOf({ code: 'invalidInput', message: 'type the six-character code' }), null);
	assert.equal(refusalOf(new Error('the connection went')), null);

	// the shell's own sentence is kept whichever it was: the screen shows it under the named
	// refusal, because a `forbidden` can still be a standing that changed while they typed.
	const wrong = joinFailed(joining, { code: 'forbidden', message: 'wrong' }, () => 'said');

	assert.equal(wrong.kind === 'password' && wrong.errorMessage, 'said');
});

// the code as the field holds it: upper-cased, six at most, and the spaces and hyphens somebody
// reading one out loud puts in taken off. Rust upper-cases and trims again.
test('a typed code is upper-cased, stripped and held to six', () => {
	assert.equal(normalizeCode('7k4m9q'), '7K4M9Q');
	assert.equal(normalizeCode(' 7k4 m9-q '), '7K4M9Q');
	assert.equal(normalizeCode('7K4M9QQQQ'), '7K4M9Q');
	assert.equal(normalizeCode(''), '');
	assert.equal(normalizeCode('!!!'), '');
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
