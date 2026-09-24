import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { hasSameOrder, toClipPath, toTransitionName } from '../list-motion.ts';

// what CSS accepts as a `<custom-ident>` written without escapes, and a leading letter.
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_-]*$/;

test('a name is an identifier whatever the id carries', () => {
	for (const id of ['01J8ZK', 'a b', 'x.y:z', 'رقم', '9f1c-2e']) {
		assert.match(toTransitionName('s1', id), IDENTIFIER, id);
	}
});

test('two different ids never share a name, even where one looks like the other escaped', () => {
	const ids = ['a.b', 'a_b', 'a_2e_b', 'a-b', 'a b'];
	const names = new Set(ids.map((id) => toTransitionName('s1', id)));

	assert.equal(names.size, ids.length);
});

test("one record in two lists wears each list's own name", () => {
	assert.notEqual(toTransitionName('s1', 'one'), toTransitionName('s2', 'one'));
});

test('the same records in the same order have nothing to move', () => {
	assert.equal(hasSameOrder([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }, { id: 'b' }]), true);
	assert.equal(hasSameOrder([], []), true);
});

test('a record gained, lost or put elsewhere is a move', () => {
	assert.equal(hasSameOrder([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }]), false);
	assert.equal(hasSameOrder([{ id: 'a' }, { id: 'b' }], [{ id: 'a' }]), false);
	assert.equal(hasSameOrder([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'a' }]), false);
});

test("the clip is the frame's box, measured from each edge of the layer, with its rounding", () => {
	assert.equal(
		toClipPath({ top: 120, right: 900, bottom: 700, left: 240 }, '24px'),
		'inset(120px calc(100% - 900px) calc(100% - 700px) 240px round 24px)'
	);
});

test('a square frame is clipped square', () => {
	assert.equal(
		toClipPath({ top: 0, right: 10, bottom: 10, left: 0 }, '0px'),
		'inset(0px calc(100% - 10px) calc(100% - 10px) 0px)'
	);
});

/**
 * The rules the snapshots are drawn by, read out of the block's own style.
 *
 * A record that stays in the list has an old image and a new one, and the browser lays them over
 * each other with `plus-lighter`, which adds the two. Their fades only sum to one record's worth of
 * light when both run on the same curve; on the exit and enter curves the sum rises well above one
 * for most of the move, and every card that stays brightens and settles back, which is the flash
 * seen on a delete and what hid the glide on a re-sort. So a record that stays shows its new image
 * alone, carried by its group, and the fades belong to the one image that has no partner.
 */
const LIST_STYLE = (() => {
	const source = readFileSync(new URL('../block/list.svelte', import.meta.url), 'utf8');

	return source.slice(source.indexOf('<style>'));
})();

function declarations(selector: string) {
	const at = LIST_STYLE.indexOf(`${selector}) {`);

	assert.notEqual(at, -1, `no rule for ${selector}`);

	return LIST_STYLE.slice(at, LIST_STYLE.indexOf('}', at));
}

test('a record that stays is drawn once, so nothing on it crossfades', () => {
	const old = declarations('::view-transition-old(*)');
	const next = declarations('::view-transition-new(*)');

	assert.match(old, /animation:\s*none/);
	assert.match(old, /opacity:\s*0/);
	assert.match(next, /animation:\s*none/);
});

test('only a record leaving or arriving fades, on its own curve', () => {
	assert.match(declarations('::view-transition-old(*):only-child'), /var\(--ease-exit\)/);
	assert.match(declarations('::view-transition-new(*):only-child'), /var\(--ease-enter\)/);
});

test('a record changing place travels on the move curve', () => {
	assert.match(declarations('::view-transition-group(*)'), /var\(--ease-move\)/);
});
