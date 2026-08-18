import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

import { InverseStack } from '../inverse.ts';

// an inverse names the change in the reader's language, and takes the whole of what a locale
// answers with — so the loaded locale is what a test hands it, rather than a stand-in shape
// nothing ever passes.
loadLocale('en');
const translations = i18nObject('en');

function inverse(name: string, log: string[] = []) {
	return {
		describe: () => name,
		undo: async () => log.push(`undo:${name}`),
		redo: async () => log.push(`redo:${name}`),
		log
	};
}

describe('the inverse stack', () => {
	it('offers nothing until a change is recorded', () => {
		const stack = new InverseStack();

		assert.equal(stack.undoable, null);
		assert.equal(stack.redoable, null);
	});

	it('takes back the newest change first', async () => {
		const stack = new InverseStack();
		const log: string[] = [];

		stack.record(inverse('first', log));
		stack.record(inverse('second', log));

		await stack.undo();
		await stack.undo();

		assert.deepEqual(log, ['undo:second', 'undo:first']);
	});

	// the ordering is what makes the identity of a restored record safe. The engine hands out
	// the next id above the highest in use, so a creation after a deletion can take the freed
	// id — and reaching the deletion means undoing that creation first, which frees it again.
	it('cannot reach a change past a newer one', async () => {
		const stack = new InverseStack();
		const log: string[] = [];

		stack.record(inverse('deletion', log));
		stack.record(inverse('creation', log));

		await stack.undo();

		assert.deepEqual(log, ['undo:creation']);
		assert.equal(stack.undoable?.describe(translations), 'deletion');
	});

	it('applies a taken-back change again, newest first', async () => {
		const stack = new InverseStack();
		const log: string[] = [];

		stack.record(inverse('first', log));
		stack.record(inverse('second', log));

		await stack.undo();
		await stack.undo();
		await stack.redo();

		assert.deepEqual(log, ['undo:second', 'undo:first', 'redo:first']);
		assert.equal(stack.redoable?.describe(translations), 'second');
	});

	it('makes a taken-back change unreachable once something new happens', async () => {
		const stack = new InverseStack();

		stack.record(inverse('first'));
		await stack.undo();
		stack.record(inverse('second'));

		assert.equal(stack.redoable, null);
	});

	it('keeps a change that could not be taken back', async () => {
		const stack = new InverseStack();
		const refused = {
			describe: () => 'refused',
			undo: async () => {
				throw new Error('the row is gone');
			},
			redo: async () => {}
		};

		stack.record(refused);

		await assert.rejects(() => stack.undo(), /the row is gone/);
		assert.equal(stack.undoable?.describe(translations), 'refused');
		assert.equal(stack.redoable, null);
	});

	it('applies nothing while an inverse is already being applied', async () => {
		const stack = new InverseStack();
		const log: string[] = [];
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = () => resolve()));

		stack.record(inverse('first', log));
		stack.record({
			describe: () => 'second',
			undo: async () => {
				log.push('undo:second');
				await held;
			},
			redo: async () => {}
		});

		const outstanding = stack.undo();
		assert.equal(await stack.undo(), null);

		release();
		await outstanding;

		assert.deepEqual(log, ['undo:second']);
	});

	it('forgets everything the workspace it was written against held', async () => {
		const stack = new InverseStack();

		stack.record(inverse('first'));
		stack.record(inverse('second'));
		await stack.undo();

		stack.clear();

		assert.equal(stack.undoable, null);
		assert.equal(stack.redoable, null);
	});

	// the workspace can be replaced while an inverse is in flight — an autosync pull needs no
	// user. What it was taken from no longer exists, so it has nowhere to land.
	it('drops an inverse the workspace was replaced underneath', async () => {
		const stack = new InverseStack();
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = () => resolve()));

		stack.record({
			describe: () => 'in flight',
			undo: async () => {
				await held;
			},
			redo: async () => {}
		});

		const outstanding = stack.undo();
		stack.clear();
		release();

		assert.equal(await outstanding, null);
		assert.equal(stack.undoable, null);
		assert.equal(stack.redoable, null);
	});

	// an inverse issues a real procedure, so a mutation the user started first can settle while
	// one is in flight and record onto this very stack.
	it('takes back the change it was applying, not whatever arrived meanwhile', async () => {
		const stack = new InverseStack();
		const log: string[] = [];
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = () => resolve()));

		stack.record({
			describe: () => 'in flight',
			undo: async () => {
				log.push('undo:in flight');
				await held;
			},
			redo: async () => {}
		});

		const outstanding = stack.undo();
		stack.record(inverse('arrived meanwhile', log));
		release();

		assert.equal((await outstanding)?.describe(translations), 'in flight');
		assert.equal(stack.undoable?.describe(translations), 'arrived meanwhile');
	});

	it('tells an observer about every change', async () => {
		const stack = new InverseStack();
		let notifications = 0;
		const stop = stack.observe(() => (notifications += 1));

		stack.record(inverse('first'));
		await stack.undo();

		assert.ok(notifications > 0);

		stop();
		const settled = notifications;
		stack.record(inverse('second'));

		assert.equal(notifications, settled);
	});
});
