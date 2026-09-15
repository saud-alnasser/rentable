import assert from 'node:assert/strict';
import test from 'node:test';

import {
	afterRead,
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
} from '$lib/organization/connect.ts';
import type { JoinStep } from '$lib/organization/connect.ts';
import type { LinkShape } from '$lib/platform/host.ts';

/**
 * THE CONNECT SCREEN, DRIVEN
 *
 * Every step the screen can be in, reached without a window. What is worth pinning is the two ways
 * a link arrives ending in the same place, the three kinds of link ending each in its own place,
 * the five refusals and the two the code gets, and that the screen never holds more than the text
 * and what the link said.
 *
 * An organization link ends at the wall, which is the startup unit's and is driven in
 * `layout/tests/startup.test.ts`; here it is `THE_WALL`, which is what the route acts on.
 *
 * **A standing is a code on the rejection and never a sentence** (effort 828, requirement 1). Rust
 * answers `refused` with a `reason` beside the message, and the assertions below build rejections
 * in exactly that shape, so a test that passes is a test the boundary can actually produce.
 */

const shape = (overrides: Partial<LinkShape> = {}): LinkShape => ({
	organizationId: 'acme',
	organizationName: 'Acme Rentals',
	kind: 'organization',
	expiresAt: null,
	...overrides
});

const LINK = 'rentable://join/abc';

/** the landing of a link that stays on this screen, narrowed for the assertions that read it. */
const stepOf = (overrides: Partial<LinkShape>): JoinStep => {
	const landing = afterRead(LINK, shape(overrides));

	assert.notEqual(landing, THE_WALL, 'expected a step rather than the wall');

	return landing as JoinStep;
};

/** a rejection as a tauri command makes one: the code, the message, and a reason on a refused. */
const rejection = (code: string, message: string, reason?: string) => ({
	code,
	message,
	...(reason ? { reason } : {})
});

const said = (error: unknown) => (error as { message: string }).message;

test('a link handed over by the operating system and a pasted one start the same way', () => {
	assert.deepEqual(beginWith(LINK), {
		kind: 'reading',
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

// effort 826, requirement 10 and effort 828, requirement 1: one field takes them all, and which
// kind it is, is read off the link's own text rather than off a row behind it.
test('the shape says which kind of link this is', () => {
	assert.equal(linkKind(shape()), 'organization');
	assert.equal(linkKind(shape({ kind: 'invitation' })), 'invitation');
	assert.equal(linkKind(shape({ kind: 'machine' })), 'machine');
});

test('an organization link ends this screen at the wall', () => {
	assert.equal(afterRead(LINK, shape()), THE_WALL);
});

// nobody is named from a link alone (effort 826, requirement 23): the organization is what the
// person recognises, and the code and the password are what they have to give.
test('an invitation link names the organization and asks for a code and a password, naming nobody', () => {
	assert.deepEqual(afterRead(LINK, shape({ kind: 'invitation', expiresAt: 1 })), {
		kind: 'password',
		link: LINK,
		organizationName: 'Acme Rentals',
		isJoining: false,
		codeRefusal: null,
		errorMessage: null
	});
});

// effort 828, requirement 3: the member already has a password, so the link they made for their
// own next machine asks for the code alone and the wall is where the password is used.
test('a machine link asks for the code alone, under the same organization name', () => {
	assert.deepEqual(afterRead(LINK, shape({ kind: 'machine', expiresAt: 1 })), {
		kind: 'code',
		link: LINK,
		organizationName: 'Acme Rentals',
		isJoining: false,
		codeRefusal: null,
		errorMessage: null
	});
});

// effort 828, requirement 1: nothing reads the row behind a link before the code is out, so every
// standing arrives as a refusal from the act that took the code. Which standing it was crosses as
// the `reason` on a `refused`, never as prose, and this is where that word becomes a step.
//
// *This test was the read's until effort 828 sealed the credential: the standing was answered
// before anybody had typed anything, and the screen showed it without asking for a code.*
test('a lapsed, consumed, revoked or replaced link is refused by name, off the code and not the sentence', () => {
	for (const step of [
		stepOf({ kind: 'invitation', expiresAt: 1 }),
		stepOf({ kind: 'machine', expiresAt: 1 })
	]) {
		const joining = joinBegun(step);

		for (const reason of ['lapsed', 'consumed', 'revoked', 'replaced'] as const) {
			assert.deepEqual(
				joinFailed(joining, rejection('refused', `the link to Acme ${reason}`, reason), said),
				{
					kind: 'refused',
					link: LINK,
					refusal: reason,
					message: `the link to Acme ${reason}`
				},
				`${step.kind}: ${reason}`
			);
		}

		// a machine that holds another organization already, met by the act that takes the code
		// rather than by the read, since the read reaches nothing.
		assert.deepEqual(
			joinFailed(joining, rejection('preconditionFailed', 'this machine holds Beta'), said),
			{
				kind: 'refused',
				link: LINK,
				refusal: 'anotherOrganization',
				message: 'this machine holds Beta'
			},
			step.kind
		);

		// the accept and the machine connect both reach the organization, so both can fail to.
		assert.deepEqual(
			joinFailed(joining, rejection('network', 'Acme could not be reached'), said),
			{ kind: 'unreachable', link: LINK, message: 'Acme could not be reached' },
			step.kind
		);
	}
});

// a word this side does not know is no reason at all: it keeps the person on the step with the
// shell's own sentence, rather than being drawn as a refusal the screen has no name for.
test('a refusal naming a standing this side does not know keeps the step and says what was said', () => {
	const joining = joinBegun(stepOf({ kind: 'invitation', expiresAt: 1 }));
	const step = joinFailed(joining, rejection('refused', 'the link was eaten', 'eaten'), said);

	assert.equal(step.kind, 'password');
	assert.equal(step.kind === 'password' && step.errorMessage, 'the link was eaten');
});

test('text that is not a link is unreadable, and an organization that cannot be reached says so', () => {
	const describe = said;

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
test('an organization link met on a machine holding another is refused on the read, carrying what the shell said', () => {
	const describe = said;

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

test('the act that takes the code holds the fields while it runs, and says what refused it', () => {
	for (const kind of ['invitation', 'machine'] as const) {
		const step = stepOf({ kind, expiresAt: 1 });
		const joining = joinBegun(step);

		assert.deepEqual(joining, { ...step, isJoining: true }, kind);

		// a failure raised on this side never crossed the boundary, so it names no refusal and is
		// shown as what it said.
		assert.deepEqual(
			joinFailed(joining, new Error('the disk is full'), said),
			{ ...step, isJoining: false, codeRefusal: null, errorMessage: 'the disk is full' },
			kind
		);
	}
});

// effort 826, requirement 23; effort 828, requirement 1: the two refusals a code gets are the two
// the person can answer without a new link, and both keep them on the step. A code that failed the
// seal is `forbidden` and a field nobody filled in is `invalidInput`. A code has no life of its own
// any more, so there is no third; a link past its moment is a refused link, which is the test above.
test('a wrong code and a missing one are told apart, on both steps that take one', () => {
	for (const kind of ['invitation', 'machine'] as const) {
		const joining = joinBegun(stepOf({ kind, expiresAt: 1 }));
		const refusalOf = (error: unknown) => {
			const step = joinFailed(joining, error, () => 'said');

			return step.kind === 'password' || step.kind === 'code'
				? step.codeRefusal
				: `left for the ${step.kind} step`;
		};

		assert.equal(refusalOf(rejection('forbidden', 'the code is wrong')), 'wrong', kind);
		assert.equal(
			refusalOf(rejection('invalidInput', 'type the six-character code')),
			'missing',
			kind
		);
		assert.equal(refusalOf(new Error('the connection went')), null, kind);

		// the shell's own sentence is kept either way: the screen shows it under the named refusal,
		// because a rarer `invalidInput` is a password under the floor rather than an empty code.
		const wrong = joinFailed(joining, rejection('forbidden', 'wrong'), () => 'said');

		assert.equal((wrong as { errorMessage?: string }).errorMessage, 'said', kind);
	}
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
