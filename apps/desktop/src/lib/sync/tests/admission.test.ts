import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeHeldOrganization,
	fakeOrganizationSession,
	fakeOrganizationState
} from '$lib/platform/tests/testing.ts';
import { organizationAdmission } from '$lib/sync/admission';

/**
 * THE WALL, IN THE ORGANIZATION'S TERMS
 *
 * Three reasons stood here and every one was a fact about a service: no account, a window closed
 * after three days, an identity with no session. The organization effort's requirement 18 removes
 * the service, and what admits a person now is a password opening a vault on this machine. So the
 * two refusals left are the organization's own, and neither has a clock.
 */

// the shell has not reported yet, and that is neither refusal: a demand put up for as long as the
// first read takes would front every launch with the card.
test('a state still loading is starting, and not a refusal', () => {
	assert.deepEqual(organizationAdmission(null), { kind: 'starting' });
	assert.deepEqual(organizationAdmission(undefined), { kind: 'starting' });
});

// requirement 17's other half: a machine that holds nothing has nothing to name and nothing to
// unlock, so the way past this is connecting rather than a password.
test('a machine that holds no organization is stopped at the door, and told why', () => {
	assert.deepEqual(
		organizationAdmission({ organization: null, session: null, holdsTursoAuthority: false }),
		{
			kind: 'signInRequired',
			reason: 'noOrganization'
		}
	);
});

// every launch after the first, and every sign-out: something to name, and a password to type.
test('a machine that holds one and no open vault is locked', () => {
	const state = fakeOrganizationState({ session: null });

	assert.deepEqual(organizationAdmission(state), { kind: 'signInRequired', reason: 'locked' });
});

// effort 824, requirement 18: a machine that connected by the link holds the organization and no
// member yet, and that is the locked door rather than the empty one; the wall is where the
// member is found.
test('a machine that connected by link and has not signed in yet is locked, not empty', () => {
	const state = fakeOrganizationState({
		organization: fakeHeldOrganization({ memberId: null, role: null }),
		session: null
	});

	assert.deepEqual(organizationAdmission(state), { kind: 'signInRequired', reason: 'locked' });
});

// requirement 18, from the door's side: what admits is the open vault, and nothing about the
// network or the clock is consulted. There is no argument to pass a moment in, deliberately.
test('an open vault admits, and the session is what the application is admitted as', () => {
	const session = fakeOrganizationSession();

	assert.deepEqual(organizationAdmission(fakeOrganizationState({ session })), {
		kind: 'admitted',
		session
	});
	assert.equal(organizationAdmission.length, 1, 'the wall takes no clock');
});
