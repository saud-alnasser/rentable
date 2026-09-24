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
	pasting,
	takeArrivingLink,
	THE_WALL
} from '$lib/organization/connect.ts';
import type { JoinStep } from '$lib/organization/connect.ts';
import type { LinkShape } from '$lib/platform/host.ts';

/**
 * THE CONNECT SCREEN, DRIVEN
 *
 * Every step the screen can be in, reached without a window. What is worth pinning is the two ways
 * a link arrives ending on the same form, the three kinds of link ending each in its own place,
 * the five refusals and the two the code gets, which of the form's two fields each marks, and that
 * the screen never holds more than the text and what the link said.
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
	kind: 'invitation',
	expiresAt: 1,
	...overrides
});

const LINK = 'rentable://join/abc';

const CODE = '7K4M9Q';

/** the landing of a link that stays on this screen, narrowed for the assertions that read it. */
const stepOf = (overrides: Partial<LinkShape>): JoinStep => {
	const landing = afterRead(LINK, CODE, shape(overrides));

	assert.notEqual(landing, THE_WALL, 'expected a step rather than the wall');

	return landing as JoinStep;
};

/** the wait a link is read and acted on in, which is the step a refusal from either lands over. */
const reading = (): JoinStep => ({ kind: 'reading', link: LINK, code: CODE });

/** a rejection as a tauri command makes one: the code, the message, and a reason on a refused. */
const rejection = (code: string, message: string, reason?: string) => ({
	code,
	message,
	...(reason ? { reason } : {})
});

const said = (error: unknown) => (error as { message: string }).message;

// effort 828, requirement 17: a link opens nothing without the code that came with it, so a link
// the operating system handed over waits in the field for the six characters rather than being
// read straight through. Both ways in are the same form; one of them arrives filled in.
test('a link handed over by the operating system and a pasted one start on the same form', () => {
	assert.deepEqual(beginWith(LINK), pasting(LINK));
	assert.deepEqual(beginWith(null), pasting());
	assert.deepEqual(beginWith('   '), pasting());
});

// a link pasted out of a chat or a mail client arrives wrapped; what a link is, is Rust's to say,
// and only the wrapping is taken off here.
test('a pasted link loses the wrapping a client put around it, and nothing inside it', () => {
	assert.equal(normalizeLink('  <rentable://join/abc>  '), LINK);
	assert.equal(normalizeLink('"rentable://join/abc".'), LINK);
	assert.equal(normalizeLink('rentable://join/a-b_c'), 'rentable://join/a-b_c');
	assert.equal(normalizeLink('not a link'), 'not a link');
});

// effort 826, requirement 10 and effort 828, requirements 1 and 16: one field takes them both, and
// which kind it is, is read off the link's own text rather than off a row behind it. There are two,
// and a third, the organization's own, retired with the credential it carried legibly.
test('the shape says which kind of link this is', () => {
	assert.equal(linkKind(shape()), 'invitation');
	assert.equal(linkKind(shape({ kind: 'machine' })), 'machine');
});

// the kind whose act ran in the read's own wait: a link a member made for this machine, connected
// with the code the form already took (effort 828, requirement 17). It admits nobody, so it ends
// at the wall, where the password does.
test('a machine link ends this screen at the wall', () => {
	assert.equal(afterRead(LINK, CODE, shape({ kind: 'machine', expiresAt: 1 })), THE_WALL);
});

// nobody is named from a link alone (effort 826, requirement 23): the organization is what the
// person recognises, and the code and the password are what they have to give.
test('an invitation link names the organization and asks for a password, holding the code, naming nobody', () => {
	assert.deepEqual(afterRead(LINK, CODE, shape({ kind: 'invitation', expiresAt: 1 })), {
		kind: 'password',
		link: LINK,
		code: CODE,
		organizationName: 'Acme Rentals',
		isJoining: false,
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
	for (const step of [stepOf({ kind: 'invitation', expiresAt: 1 }), reading()]) {
		const joining = joinBegun(step);

		for (const reason of ['lapsed', 'consumed', 'revoked', 'replaced'] as const) {
			assert.deepEqual(
				joinFailed(joining, rejection('refused', `the link to Acme ${reason}`, reason), said),
				{
					kind: 'refused',
					link: LINK,
					refusal: reason,
					message: `the link to Acme ${reason}`,
					// which act was refused, which is what says whether the organization was
					// recorded before the row was judged: the password step is the invitation's
					// accept, which reaches and records first, and the reading step is the machine
					// connect, which judges its row before anything is recorded. The screen reads
					// it to decide whether a spent link has a wall to offer (ticket 20).
					wasConnecting: step.kind === 'password'
				},
				`${step.kind}: ${reason}`
			);
		}

		// a machine that holds another organization already, met by the act that takes the code
		// rather than by the read, since the read reaches nothing.
		assert.deepEqual(
			joinFailed(
				joining,
				rejection('refused', 'this machine holds Beta', 'anotherOrganizationHeld'),
				said
			),
			{
				kind: 'refused',
				link: LINK,
				refusal: 'anotherOrganization',
				message: 'this machine holds Beta',
				wasConnecting: step.kind === 'password'
			},
			step.kind
		);

		// the accept and the machine connect both reach the organization, so both can fail to.
		assert.deepEqual(
			joinFailed(joining, rejection('network', 'Acme could not be reached'), said),
			{ kind: 'unreachable', link: LINK, code: CODE, message: 'Acme could not be reached' },
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

// effort 828, requirement 17: the link is the half a decode refuses, so the form comes back with
// the link field marked and the code the person typed still in it, rather than on a step of its
// own that throws the code away.
test('text that is not a link marks the link field, and an organization that cannot be reached says so', () => {
	const describe = said;

	assert.deepEqual(
		inspectionFailed(
			'nope',
			CODE,
			{ code: 'refused', reason: 'linkUnreadable', message: 'not a link' },
			describe
		),
		{ ...pasting('nope', CODE), isUnreadable: true }
	);
	assert.deepEqual(
		inspectionFailed(
			LINK,
			CODE,
			{ code: 'network', message: 'Acme could not be reached' },
			describe
		),
		{ kind: 'unreachable', link: LINK, code: CODE, message: 'Acme could not be reached' }
	);
	// a failure with no code is still shown as what it said, rather than swallowed.
	assert.deepEqual(inspectionFailed(LINK, CODE, new Error('the disk is full'), describe), {
		kind: 'unreachable',
		link: LINK,
		code: CODE,
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
			CODE,
			{
				code: 'refused',
				reason: 'anotherOrganizationHeld',
				message: 'this machine already holds Beta; disconnect it before connecting another'
			},
			describe
		),
		{
			kind: 'refused',
			link: LINK,
			refusal: 'anotherOrganization',
			message: 'this machine already holds Beta; disconnect it before connecting another',
			// nothing was reached and nothing was recorded: the read is a decode.
			wasConnecting: false
		}
	);
});

test('the accept holds the fields while it runs, and says what refused it', () => {
	const step = stepOf({ kind: 'invitation', expiresAt: 1 });
	const joining = joinBegun(step);

	assert.deepEqual(joining, { ...step, isJoining: true });

	// a failure raised on this side never crossed the boundary, so it names no refusal and leaves
	// the person on the password they were choosing, shown as what it said.
	assert.deepEqual(joinFailed(joining, new Error('the disk is full'), said), {
		...step,
		isJoining: false,
		errorMessage: 'the disk is full'
	});
});

// a failure with no name met in the read's own wait has no field to mark either, so it hands the
// form back with what was typed and the shell's sentence over it.
test('a nameless failure in the read wait hands the form back, with nothing marked', () => {
	assert.deepEqual(joinFailed(reading(), new Error('the disk is full'), said), {
		...pasting(LINK, CODE),
		errorMessage: 'the disk is full'
	});
});

// effort 826, requirement 23; effort 828, requirement 1: the two refusals a code gets are the two
// the person can answer without a new link, and both keep them on the step. A code that failed the
// seal is refused as `codeWrong` and a field nobody filled in as `codeMissing`. A code has no
// life of its own any more, so there is no third; a link past its moment is a refused link, which is the test above.
test('a wrong code and a missing one are told apart, and both mark the code field', () => {
	for (const step of [joinBegun(stepOf({ kind: 'invitation', expiresAt: 1 })), reading()]) {
		const landing = (error: unknown) => joinFailed(step, error, () => 'said');
		const refusalOf = (error: unknown) => {
			const next = landing(error);

			return next.kind === 'paste' ? next.codeRefusal : `left for the ${next.kind} step`;
		};

		assert.equal(
			refusalOf(rejection('refused', 'the code is wrong', 'codeWrong')),
			'wrong',
			step.kind
		);
		assert.equal(
			refusalOf(rejection('refused', 'type the six-character code', 'codeMissing')),
			'missing',
			step.kind
		);

		// the link the person already typed is handed back with the code, so the one field they
		// have to answer is the one that was refused.
		assert.deepEqual(
			landing(rejection('refused', 'the code is wrong', 'codeWrong')),
			{ ...pasting(LINK, CODE), codeRefusal: 'wrong', errorMessage: 'said' },
			step.kind
		);
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

// neither transition has anything to say about a step no act is out over: a corner back pressed
// while the accept was running leaves the form as it was.
test('the accept transitions leave every other step alone', () => {
	assert.deepEqual(joinBegun(pasting(LINK, CODE)), pasting(LINK, CODE));
	assert.deepEqual(
		joinFailed(pasting(LINK, CODE), new Error('anything'), () => 'said'),
		pasting(LINK, CODE)
	);
});

test('an arriving link is taken once, and a second replaces a first nobody opened', () => {
	assert.equal(takeArrivingLink(), null);

	linkArrived('rentable://join/first');
	linkArrived('rentable://join/second');

	assert.equal(takeArrivingLink(), 'rentable://join/second');
	assert.equal(takeArrivingLink(), null);
});
