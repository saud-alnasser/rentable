import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMINISTRATION_BY_ROLE, maskOf } from '@rentable/workspace-permission';
import { holdsEvery, permittedBranch } from '$lib/workspace/permitted';

/**
 * The three branches, driven rather than looked at. No component in this repository is tested by
 * rendering it — a `.svelte` file cannot be imported under `tsx` at all — so what the gate decides
 * lives in `permitted.ts` and this is what drives it.
 */
test('a member who holds the act sees the subtree, whichever branch the caller asked for', () => {
	const holder = maskOf('renameWorkspace');

	assert.equal(permittedBranch(holder, ['renameWorkspace'], 'absent'), 'children');
	assert.equal(permittedBranch(holder, ['renameWorkspace'], 'unavailable'), 'children');
});

// **`otherwise` is the whole of what separates these two**, which is the point of it having no
// default: the member is the same and the act is the same, and what a reader sees is the caller's
// decision about what absence would cost them.
test('a member who does not is absent where the caller asked for absent', () => {
	assert.equal(
		permittedBranch(ADMINISTRATION_BY_ROLE.member, ['renameWorkspace'], 'absent'),
		'nothing'
	);
});

test('and present-and-unavailable where the caller asked for that', () => {
	assert.equal(
		permittedBranch(ADMINISTRATION_BY_ROLE.member, ['renameWorkspace'], 'unavailable'),
		'unavailable'
	);
});

/**
 * **Every act, not any of them.** A subtree gated on two acts is a subtree that does two things,
 * and a member holding one of them cannot use it.
 */
test('a member holding some of a set is refused for the set', () => {
	const one = maskOf('renameWorkspace');

	assert.equal(holdsEvery(one, ['renameWorkspace']), true);
	assert.equal(holdsEvery(one, ['renameWorkspace', 'inviteMember']), false);
	assert.equal(permittedBranch(one, ['renameWorkspace', 'inviteMember'], 'absent'), 'nothing');

	const both = maskOf('renameWorkspace', 'inviteMember');

	assert.equal(holdsEvery(both, ['renameWorkspace', 'inviteMember']), true);
	assert.equal(permittedBranch(both, ['renameWorkspace', 'inviteMember'], 'absent'), 'children');
});

// A member of another workspace holding every flag there says nothing about this one. The number
// is the only input, which is what keeps that true without anything having to remember it.
test('an unrelated act does not open a gate', () => {
	assert.equal(holdsEvery(maskOf('inviteMember', 'removeMember'), ['renameWorkspace']), false);
});

/**
 * **A machine that has heard nothing administers nothing.** Zero is where an older control plane,
 * a store written before permissions existed, a query that has not resolved and a member who
 * genuinely administers nothing all arrive, and a gate treats them alike — which is the safe
 * direction, and the honest one: a client that has not been told what a member may do should not
 * be drawing the controls.
 */
test('zero opens nothing', () => {
	assert.equal(permittedBranch(0, ['renameWorkspace'], 'absent'), 'nothing');
	assert.equal(permittedBranch(0, ['renameWorkspace'], 'unavailable'), 'unavailable');
});

/**
 * **Pinned rather than defended.** `[].every(...)` is `true`, so a gate naming no acts gates
 * nothing. It is a caller mistake and the place to refuse it is the prop type, which does not
 * refuse it today — `procedure.permitted()` has the identical hole, and the two want tightening
 * together rather than one of them quietly diverging.
 */
test('a gate that names no acts gates nothing', () => {
	assert.equal(permittedBranch(0, [], 'absent'), 'children');
});
