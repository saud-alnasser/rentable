import assert from 'node:assert/strict';
import test from 'node:test';

import { ADMINISTRATION_BY_ROLE, maskOf, type NamedActs } from '@rentable/workspace-permission';
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
 * **Defended now, and by the compiler.** `[].every(...)` is `true`, so a gate naming no acts
 * opens for a member who administers nothing — a gate that admits everybody, wearing the look of
 * one that is working. This file used to pin that as a known hole. Both surfaces that take a list
 * of acts now take `NamedActs`, so the caller mistake does not compile.
 *
 * **The assertion is `@ts-expect-error`, and there is nothing to run.** A type-level refusal has
 * no runtime behaviour to drive, and the directive is what drives it: `pnpm check` fails if the
 * line ever stops being an error, which is what keeps this from becoming a comment about
 * something that used to be true. Every test here is type-checked, the desktop's included, so
 * this is inside the gate rather than beside it.
 */
// @ts-expect-error an empty list names no act, and NamedActs is one act at least
const _aGateNamingNoActsDoesNotCompile: NamedActs = [];
void _aGateNamingNoActsDoesNotCompile;

/**
 * `holdsEvery` keeps taking a plain array, and this is why the refusal is at the boundary rather
 * than here. It is arithmetic over a list, a list can be empty, and `true` is the right answer
 * for *does this member hold every one of nothing*. What is wrong is a caller naming nothing, and
 * that caller is now a compile error.
 */
test('the arithmetic over an empty list is still true, which is why the type is what refuses it', () => {
	assert.equal(holdsEvery(0, []), true);
	assert.equal(permittedBranch(0, [], 'absent'), 'children');
});
