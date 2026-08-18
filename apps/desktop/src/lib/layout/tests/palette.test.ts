import assert from 'node:assert/strict';
import test from 'node:test';

import { ShortcutRegistry, toShortcutSheetEntries } from '../../design/shortcut-registry.ts';
import { matchesTerm, toPaletteVerbs } from '../palette.ts';

/** enough of the translations for a name and a reason to read, without the generated bundle. */
const translations = {
	common: {
		actions: { renewContract: () => 'renew a contract' },
		undo: { undo: () => 'undo', nothingToUndo: () => 'nothing to take back' },
		ui: { commandPalette: () => 'command palette', toggleSidebar: () => 'toggle sidebar' }
	}
};

/**
 * A registry holding exactly what a test hands it, and a record of everything the shell would
 * have done — so a test can say what ran and, just as importantly, what did not.
 */
function registryOf(...registrations) {
	const registry = new ShortcutRegistry(() => {});

	for (const registration of registrations) {
		registry.register(registration);
	}

	return registry;
}

/** the shortcut that toggles the navigation: an ordinary application shortcut, with keys. */
function sidebarToggle(ran = []) {
	return {
		id: 'sidebar.toggle',
		scope: 'application',
		keys: [{ key: 'b', command: true }],
		describe: (t) => t.common.ui.toggleSidebar(),
		run: () => ran.push('sidebar.toggle')
	};
}

/** the action that has to ask which contract before it can do anything. */
function renewContract(ran = []) {
	return {
		id: 'contract.renew',
		scope: 'record',
		subject: 'contract',
		describe: (t) => t.common.actions.renewContract(),
		run: (contractId) => ran.push(`contract.renew:${contractId}`)
	};
}

test('an application shortcut is offered by name, with the keys that also run it', () => {
	const verbs = toPaletteVerbs(registryOf(sidebarToggle()).registered, translations, false);

	assert.deepEqual(
		verbs.map((verb) => ({ id: verb.id, label: verb.label, hints: verb.hints })),
		[{ id: 'sidebar.toggle', label: 'toggle sidebar', hints: ['Ctrl B'] }]
	);
});

// the keys that move a list have no `run` behind them at all, and mean nothing where a reader
// is choosing from a list of names.
test('a surface shortcut is not an action, so the palette does not offer it', () => {
	const registry = registryOf({
		id: 'list.move',
		scope: 'surface',
		keys: [{ key: 'ArrowDown' }],
		describe: () => 'move between records'
	});

	assert.deepEqual(toPaletteVerbs(registry.registered, translations, false), []);
});

test('and nor is a shortcut that says it is not offered', () => {
	const registry = registryOf({
		id: 'palette.toggle',
		scope: 'application',
		keys: [{ key: 'k', command: true }],
		describe: (t) => t.common.ui.commandPalette(),
		offeredInPalette: false,
		run: () => {}
	});

	assert.deepEqual(toPaletteVerbs(registry.registered, translations, false), []);
});

// the criterion the whole ticket rests on: the action runs where the reader is standing. The
// palette hands it nothing it could navigate with — no path, no href, no router — so the only
// thing a row can do is the work the registration declared.
test('running an action does its work and nothing else — no navigation happens', () => {
	const ran = [];
	const navigated = [];
	const verbs = toPaletteVerbs(registryOf(sidebarToggle(ran)).registered, translations, false);

	verbs[0].run();

	assert.deepEqual(ran, ['sidebar.toggle']);
	assert.deepEqual(navigated, []);
	assert.equal(verbs[0].subject, undefined, 'nothing about the row names a destination');
});

test('an action that acts on a record names the concept it has to ask for', () => {
	const verbs = toPaletteVerbs(registryOf(renewContract()).registered, translations, false);

	assert.equal(verbs[0].subject, 'contract');
	assert.deepEqual(verbs[0].hints, [], 'no keydown can say which contract, so no keys reach it');
});

test('and is given the record the reader chose, rather than failing without one', () => {
	const ran = [];
	const verbs = toPaletteVerbs(registryOf(renewContract(ran)).registered, translations, false);

	verbs[0].run(42);

	assert.deepEqual(ran, ['contract.renew:42']);
});

// never silently inert: the row is offered and refused, and the refusal carries its reason.
test('an action that cannot run right now says why, in the active locale', () => {
	const registry = registryOf({
		id: 'undo',
		scope: 'application',
		keys: [{ key: 'z', command: true, shift: false }],
		describe: (t) => t.common.undo.undo(),
		unavailable: (t) => t.common.undo.nothingToUndo(),
		run: () => {}
	});

	assert.equal(
		toPaletteVerbs(registry.registered, translations, false)[0].unavailable,
		'nothing to take back'
	);
});

test('and one that can carries no reason at all', () => {
	const verbs = toPaletteVerbs(registryOf(sidebarToggle()).registered, translations, false);

	assert.equal(verbs[0].unavailable, undefined);
});

test('actions are ordered by name, not by the order they were mounted in', () => {
	const registry = registryOf(renewContract(), sidebarToggle());

	assert.deepEqual(
		toPaletteVerbs(registry.registered, translations, false).map((verb) => verb.id),
		['contract.renew', 'sidebar.toggle']
	);
});

// the sheet answers *what does pressing something do*, and an action nothing reaches answers it
// with a blank. The two surfaces read one registry and disagree only about this.
test('an action with no keys reaches the palette and stays off the shortcut sheet', () => {
	const registry = registryOf(renewContract(), sidebarToggle());

	assert.deepEqual(
		toShortcutSheetEntries(registry.registered, translations, false).map((entry) => entry.id),
		['sidebar.toggle']
	);
	assert.deepEqual(
		toPaletteVerbs(registry.registered, translations, false).map((verb) => verb.id),
		['contract.renew', 'sidebar.toggle']
	);
});

// two registrations that share no keydown cannot collide, and an action reached by no keydown
// shares one with nothing.
test('an action with no keys collides with nothing', () => {
	const collisions = [];
	const registry = new ShortcutRegistry((collision) => collisions.push(collision));

	registry.register(renewContract());
	registry.register({ ...renewContract(), id: 'contract.terminate' });
	registry.register(sidebarToggle());

	assert.deepEqual(collisions, []);
});

test('an empty term matches everything, so the palette opens on all of it', () => {
	assert.equal(matchesTerm('renew a contract', ''), true);
	assert.equal(matchesTerm('renew a contract', '   '), true);
});

test('a name is matched however it is cased', () => {
	assert.equal(matchesTerm('Renew A Contract', 'renew'), true);
	assert.equal(matchesTerm('renew a contract', 'CONTRACT'), true);
	assert.equal(matchesTerm('renew a contract', 'terminate'), false);
});

// the criterion #488's normalization exists for, applied to the one surface that matches text
// held in memory rather than in a column: an action named in Arabic is found however either
// side spells it.
test('and however either side spells an arabic name', () => {
	assert.equal(matchesTerm('إنهاء العقد', 'انهاء'), true);
	assert.equal(matchesTerm('انهاء العقد', 'إنهاء'), true);
	assert.equal(matchesTerm('تجديد عقد', 'تجديــد'), true, 'the tatweel only stretches a join');
});

test('and a number typed as it is rendered', () => {
	assert.equal(matchesTerm('contract 1500', '١٥٠٠'), true);
	assert.equal(matchesTerm('عقد ١٥٠٠', '1500'), true);
});
