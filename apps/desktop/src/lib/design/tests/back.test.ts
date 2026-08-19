import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BackTrail, toScreen } from '../back.ts';

/**
 * a record's url with a section on it — the whole url the shell hands over, of which the path
 * is the part a screen is keyed by.
 *
 * Named rather than written out at each call because it is a url and not a path: the shell
 * passes `page.url`, which carries everything after the path too.
 */
const sectionOfARecord = { pathname: '/tenants/4', search: '?section=contracts' };

// the section of a detail view is a query parameter, and moving between the sections of a
// record is not leaving it.
describe('what counts as a screen', () => {
	it('is the path, and never what follows it', () => {
		assert.equal(toScreen({ pathname: '/tenants/4' }), '/tenants/4');
		assert.equal(toScreen(sectionOfARecord), '/tenants/4');
	});
});

describe('where back returns to', () => {
	it('is nowhere before anything has been visited, and nowhere from the first screen', () => {
		const trail = new BackTrail();
		assert.equal(trail.previous, null);

		trail.visit('/tenants/4');
		assert.equal(trail.previous, null);
	});

	it('is the screen that opened the record, whichever one it was', () => {
		const fromDirectory = new BackTrail();
		fromDirectory.visit('/tenants');
		fromDirectory.visit('/tenants/4');

		const fromAContract = new BackTrail();
		fromAContract.visit('/contracts/9');
		fromAContract.visit('/tenants/4');

		assert.equal(fromDirectory.previous, '/tenants');
		assert.equal(fromAContract.previous, '/contracts/9');
	});

	it('does not change as the reader moves between a record’s sections', () => {
		const trail = new BackTrail();

		trail.visit('/contracts/9');
		trail.visit(toScreen({ pathname: '/tenants/4' }));
		trail.visit(toScreen(sectionOfARecord));

		assert.equal(trail.current, '/tenants/4');
		assert.equal(trail.previous, '/contracts/9');
	});

	// going back walks the trail rather than extending it: without this, two screens would
	// each point at the other for ever and every press would make the trail longer.
	it('is behind the reader again once they have gone back', () => {
		const trail = new BackTrail();

		trail.visit('/tenants');
		trail.visit('/tenants/4');
		trail.visit('/tenants');

		assert.equal(trail.current, '/tenants');
		assert.equal(trail.previous, null);
	});

	it('skips a record that no longer exists, wherever it was visited', () => {
		const trail = new BackTrail();

		trail.visit('/tenants');
		trail.visit('/tenants/4');
		trail.visit('/contracts/9');
		trail.visit('/complexes/2');
		trail.visit('/tenants/4');

		trail.forget('/tenants/4');

		assert.equal(trail.current, '/complexes/2');
		assert.equal(trail.previous, '/contracts/9');
	});

	it('forgets the screen the reader is on when the record it showed is deleted', () => {
		const trail = new BackTrail();

		trail.visit('/tenants');
		trail.visit('/tenants/4');
		trail.forgetCurrent();

		assert.equal(trail.current, '/tenants');
	});

	it('does not grow without bound', () => {
		const trail = new BackTrail();

		for (let index = 0; index < 500; index += 1) {
			trail.visit(`/tenants/${index}`);
		}

		assert.equal(trail.current, '/tenants/499');
		assert.equal(trail.previous, '/tenants/498');
	});

	it('tells an observer about every change, and stops when asked', () => {
		const trail = new BackTrail();
		let notifications = 0;
		const stop = trail.observe(() => (notifications += 1));

		trail.visit('/tenants');
		trail.forget('/tenants');
		trail.forget('/complexes/2');

		assert.equal(notifications, 2, 'forgetting nothing should say nothing happened');

		stop();
		trail.visit('/contracts');

		assert.equal(notifications, 2);
	});
});
