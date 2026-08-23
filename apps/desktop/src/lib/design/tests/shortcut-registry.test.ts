import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

import type { ShortcutCombination } from '@rentable/design/shortcut.ts';
import {
	ShortcutRegistry,
	toShortcutSheetEntries,
	type ApplicationShortcut,
	type ShortcutCollision
} from '../shortcut-registry.ts';

// a registration describes itself from the whole of what a locale answers with, so the loaded
// locale is what a test hands it rather than a two-key shape nothing ever passes.
loadLocale('en');
const translations = i18nObject('en');

/** what a keydown reached, as a real `EventTarget` carrying what decides an editing field. */
function eventTarget(element: { tagName: string; isContentEditable?: boolean }): EventTarget {
	return Object.assign(new EventTarget(), element);
}

/** a registry and the collisions it reported, so a test can assert on both. */
function openRegistry() {
	const reported: ShortcutCollision[] = [];

	return { registry: new ShortcutRegistry((collision) => reported.push(collision)), reported };
}

/** an application shortcut with everything a test does not care about filled in. */
function shortcut(
	id: string,
	keys: [ShortcutCombination, ...ShortcutCombination[]],
	extra: Partial<ApplicationShortcut> = {}
): ApplicationShortcut {
	return { id, scope: 'application', keys, describe: () => id, run: () => {}, ...extra };
}

const held = { ctrlKey: true, metaKey: false, shiftKey: false };

test('nothing is registered until something registers', () => {
	const { registry } = openRegistry();

	assert.deepEqual(registry.registered, []);
});

// the sheet is generated or it is not a sheet: this asserts a shortcut nothing on the surface
// knows about arrives on it anyway.
test('a shortcut registered without touching the sheet appears on it', () => {
	const { registry } = openRegistry();

	registry.register({
		id: 'ledger.export',
		scope: 'application',
		keys: [{ key: 'e', command: true }],
		describe: (t) => t.common.ui.commandPalette(),
		run: () => {}
	});

	const entries = toShortcutSheetEntries(registry.registered, translations, false);

	assert.deepEqual(entries, [
		{ id: 'ledger.export', description: 'command palette', hints: ['Ctrl E'] }
	]);
});

test('the sheet reads its descriptions from the translations it is handed', () => {
	const { registry } = openRegistry();

	registry.register(
		shortcut('sidebar.toggle', [{ key: 'b', command: true }], {
			describe: (t) => t.common.ui.toggleSidebar()
		})
	);

	loadLocale('ar');
	const arabic = i18nObject('ar');

	assert.equal(
		toShortcutSheetEntries(registry.registered, arabic, false)[0].description,
		'تبديل الشريط الجانبي'
	);
});

test('every combination a shortcut answers is printed, not only the first', () => {
	const { registry } = openRegistry();

	registry.register(
		shortcut('redo', [
			{ key: 'z', command: true, shift: true },
			{ key: 'y', command: true }
		])
	);

	assert.deepEqual(toShortcutSheetEntries(registry.registered, translations, false)[0].hints, [
		'Ctrl Shift Z',
		'Ctrl Y'
	]);
});

test('the sheet is ordered by the printed keys, so mount order does not shuffle it', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('second', [{ key: 'k', command: true }]));
	registry.register(shortcut('first', [{ key: 'b', command: true }]));

	assert.deepEqual(
		toShortcutSheetEntries(registry.registered, translations, false).map((entry) => entry.id),
		['first', 'second']
	);
});

test('an apple keyboard is printed with the symbols it has on it', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('redo', [{ key: 'z', command: true, shift: true }]));

	assert.deepEqual(toShortcutSheetEntries(registry.registered, translations, true)[0].hints, [
		'⌘ ⇧ Z'
	]);
});

test('a shortcut removed is off the sheet again', () => {
	const { registry } = openRegistry();

	const remove = registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	remove();

	assert.deepEqual(registry.registered, []);
});

test('a surface answering its own keys is still listed', () => {
	const { registry } = openRegistry();

	registry.register({
		id: 'list.next',
		scope: 'surface',
		keys: [{ key: 'j' }],
		describe: () => 'next record'
	});

	assert.deepEqual(
		toShortcutSheetEntries(registry.registered, translations, false).map((entry) => entry.id),
		['list.next']
	);
});

test('and is never fired by the application, which is not where it means anything', () => {
	const { registry } = openRegistry();

	registry.register({
		id: 'list.next',
		scope: 'surface',
		keys: [{ key: 'j' }],
		describe: () => 'next record'
	});

	assert.deepEqual(
		registry.answering({ ctrlKey: false, metaKey: false, shiftKey: false, key: 'j', code: 'KeyJ' }),
		[]
	);
});

test('two registrations claiming the same keys are reported', () => {
	const { registry, reported } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));
	registry.register(shortcut('kanban.toggle', [{ key: 'k', command: true }]));

	assert.deepEqual(reported, [
		{ held: 'palette.toggle', arriving: 'kanban.toggle', combination: { key: 'k', command: true } }
	]);
});

test('and are both registered, so the sheet shows the fault rather than hiding it', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));
	registry.register(shortcut('kanban.toggle', [{ key: 'k', command: true }]));

	assert.equal(registry.registered.length, 2);
});

// the pair that made a three-state modifier necessary: they share a letter and are told apart
// by shift, so reporting them would cry wolf on the application's own shortcuts.
test('a modifier that separates two shortcuts is not a collision', () => {
	const { registry, reported } = openRegistry();

	registry.register(shortcut('undo', [{ key: 'z', command: true, shift: false }]));
	registry.register(shortcut('redo', [{ key: 'z', command: true, shift: true }]));

	assert.deepEqual(reported, []);
});

test('a modifier left unstated collides with both answers to it', () => {
	const { registry, reported } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));
	registry.register(shortcut('kanban.toggle', [{ key: 'k', command: true, shift: true }]));

	assert.equal(reported.length, 1);
});

test('two surfaces may claim one key, because only one of them has focus', () => {
	const { registry, reported } = openRegistry();

	registry.register({
		id: 'list.next',
		scope: 'surface',
		keys: [{ key: 'j' }],
		describe: () => ''
	});
	registry.register({
		id: 'grid.next',
		scope: 'surface',
		keys: [{ key: 'j' }],
		describe: () => ''
	});

	assert.deepEqual(reported, []);
});

test('an application shortcut collides with a surface one, because it fires from anywhere', () => {
	const { registry, reported } = openRegistry();

	registry.register({
		id: 'list.next',
		scope: 'surface',
		keys: [{ key: 'j' }],
		describe: () => ''
	});
	registry.register(shortcut('somewhere.next', [{ key: 'j' }]));

	assert.equal(reported.length, 1);
});

test('a keydown reaches the shortcut claiming it', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	assert.deepEqual(
		registry.answering({ ...held, key: 'k', code: 'KeyK' }).map((found) => found.id),
		['palette.toggle']
	);
});

// the arabic layout puts ك on the k key and ب on the b key; matching the physical key is what
// keeps a shortcut alive in a locale this application treats as first class.
test('an arabic layout reaches it too', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));
	registry.register(shortcut('sidebar.toggle', [{ key: 'b', command: true }]));

	assert.deepEqual(
		registry.answering({ ...held, key: 'ك', code: 'KeyK' }).map((found) => found.id),
		['palette.toggle']
	);
	assert.deepEqual(
		registry.answering({ ...held, key: 'ب', code: 'KeyB' }).map((found) => found.id),
		['sidebar.toggle']
	);
});

test('the key without its modifier is not the shortcut', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	assert.deepEqual(
		registry.answering({ ctrlKey: false, metaKey: false, shiftKey: false, key: 'k', code: 'KeyK' }),
		[]
	);
});

test('command answers wherever ctrl does', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	assert.equal(
		registry.answering({ ctrlKey: false, metaKey: true, shiftKey: false, key: 'k', code: 'KeyK' })
			.length,
		1
	);
});

// ctrl+shift+k has always opened the palette, because the palette never looked at shift.
test('a modifier a shortcut never consulted is still not consulted', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	assert.equal(registry.answering({ ...held, shiftKey: true, key: 'k', code: 'KeyK' }).length, 1);
});

test('a shortcut that stands down while text is typed stands down', () => {
	const { registry } = openRegistry();

	registry.register(
		shortcut('undo', [{ key: 'z', command: true, shift: false }], {
			standsDownWhileEditing: true
		})
	);

	assert.deepEqual(
		registry.answering({ ...held, key: 'z', code: 'KeyZ' }, eventTarget({ tagName: 'INPUT' })),
		[]
	);
	assert.equal(
		registry.answering({ ...held, key: 'z', code: 'KeyZ' }, eventTarget({ tagName: 'BUTTON' }))
			.length,
		1
	);
});

test('one that does not, does not', () => {
	const { registry } = openRegistry();

	registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	assert.equal(
		registry.answering({ ...held, key: 'k', code: 'KeyK' }, eventTarget({ tagName: 'INPUT' }))
			.length,
		1
	);
});

test('an observer hears a shortcut arrive and leave', () => {
	const { registry } = openRegistry();
	let changes = 0;

	const stop = registry.observe(() => (changes += 1));
	const remove = registry.register(shortcut('palette.toggle', [{ key: 'k', command: true }]));

	remove();
	stop();
	registry.register(shortcut('sidebar.toggle', [{ key: 'b', command: true }]));

	assert.equal(changes, 2);
});
