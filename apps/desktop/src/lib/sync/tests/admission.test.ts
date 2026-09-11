import assert from 'node:assert/strict';
import test from 'node:test';

import {
	fakeJoinedOrganization,
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

// requirement 17's other half: a machine that has joined nothing has nothing to list and nothing
// to unlock, so the way past this is the first run rather than a password.
test('a machine that has joined no organization is stopped at the door, and told why', () => {
	assert.deepEqual(organizationAdmission({ organizations: [], session: null }), {
		kind: 'signInRequired',
		reason: 'noOrganization'
	});
});

// every launch after the first, and every sign-out: something to list, and a password to type.
test('a machine that has joined one and holds no open vault is locked', () => {
	const state = fakeOrganizationState({ session: null });

	assert.deepEqual(organizationAdmission(state), { kind: 'signInRequired', reason: 'locked' });
});

test('two joined organizations are still one locked door, because either password opens it', () => {
	const state = fakeOrganizationState({
		organizations: [fakeJoinedOrganization(), fakeJoinedOrganization({ id: 'beta', name: 'Beta' })],
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

// a member who must still change their password is in, on a password somebody else drew, and
// the one thing on offer is choosing their own: the shell refuses everything else at each command,
// which is the sign-in ticket's second criterion, and this is the screen that says so first. The
// session travels with the answer, because the screen names the organization from it.
test('a member who must change their password is asked to, and reaches nothing else', () => {
	const session = fakeOrganizationSession({ mustChangePassword: true });
	const admission = organizationAdmission(fakeOrganizationState({ session }));

	assert.equal(admission.kind, 'passwordChangeRequired');
	assert.equal(
		admission.kind === 'passwordChangeRequired' && admission.session.organizationName,
		session.organizationName
	);
});
