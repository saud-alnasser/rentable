import assert from 'node:assert/strict';
import test from 'node:test';

import {
	STARTUP_STAGES,
	STARTUP_STAGE_WEIGHTS,
	startupProgressFor,
	startupProgressWithin
} from '../startup-stage.ts';
import { harness, signedOut, withoutSession } from './testing.ts';

/**
 * THE BAR IS A REPORT, AND THIS IS WHAT MAKES IT ONE
 *
 * Requirement 16 asks that every stage the loading screen names is an await the startup path
 * actually performs, with none invented and none folded away. That is a claim about two things
 * agreeing, so it is checked by running one against the other.
 *
 * **It drives a startup now, where it used to read the route's source.** That was this file's own
 * stated limitation: startup lived in `routes/+layout.svelte`, which cannot be driven without a
 * window, so the best available check was a scan for `reportStartupStage` calls plus a look at
 * whether the stages inside each function body ascended. It could not tell whether one function
 * ran before another, which left the one thing the order actually is unchecked. Requirement 9
 * extracted the unit, so this asks a real startup what it reported.
 */

/** the stages a whole successful startup reports, in the order it reports them. */
async function stagesOfAStartup() {
	const { startup, journal } = harness();

	await startup.start();

	return journal.stages;
}

test('every stage the screen can name is one the startup path reports', async () => {
	const reported = new Set(await stagesOfAStartup());

	for (const stage of STARTUP_STAGES) {
		assert.ok(reported.has(stage), `the bar names ${stage} and the startup path never reports it`);
	}
});

// The other direction, and it is the one that rots quietly: a stage reported with no entry in the
// list would leave the bar showing the stage before it while that work ran.
test('every stage the startup path reports is one the screen knows', async () => {
	for (const stage of await stagesOfAStartup()) {
		assert.ok(
			STARTUP_STAGES.includes(stage),
			`the startup path reports ${stage} and the bar has no name or weight for it`
		);
	}
});

// **The order is the requirement, not an incidental.** `settings` before `account` before
// `workspace` is the admission ordering: nothing opens the database before there is an account. A
// bar that walked them in another order would be describing a startup this application does not
// perform.
//
// This is what the source scan could not do. The order below is execution order, so two reports
// swapped in place fail it, and so does a report moved from one part of the path to another.
test('the stages a startup reports ascend through the list, in the order it runs', async () => {
	const reported = await stagesOfAStartup();

	assert.deepEqual(reported, [...STARTUP_STAGES], 'every stage, once, in the declared order');
});

// The two paths that re-enter partway along, which is honest rather than a defect: signing in and
// retrying a session both start where the workspace opens, because the three stages before that
// are what they have already done.
test('a path that re-enters partway along starts partway along, and still ascends', async () => {
	const { startup, journal } = harness({
		remoteSync: signedOut(),
		signInWith: async () => withoutSession()
	});

	await startup.start();
	assert.deepEqual(journal.stages, ['settings', 'account'], 'as far as the wall, and no further');

	journal.stages.length = 0;
	await startup.signIn();
	await startup.retrySession();

	assert.deepEqual(journal.stages, ['workspace', 'changes', 'records']);
});

test('every stage carries a weight, and no weight is zero', () => {
	for (const stage of STARTUP_STAGES) {
		const weight = STARTUP_STAGE_WEIGHTS[stage];

		assert.ok(weight > 0, `${stage} has no share of the bar, so reaching it would move nothing`);
	}
});

// What the screen actually reads off. A bar that went backwards, or that sat still across a stage
// boundary, is the failure the whole requirement exists to prevent.
test('the bar starts empty and moves forward at every boundary', () => {
	let previous = -1;

	for (const stage of STARTUP_STAGES) {
		const progress = startupProgressFor(stage);

		assert.ok(progress > previous, `reaching ${stage} does not move the bar`);
		previous = progress;
	}

	assert.equal(startupProgressFor(STARTUP_STAGES[0]), 0, 'the bar starts part-full');
	assert.ok(previous < 100, 'the last stage fills the bar before its work is done');
});

// **The one the requirement names.** Counting the stage in progress as done would put the bar
// near full for the longest wait in the run, which is worse than equal fifths rather than better:
// it is the *walks to nearly full and then waits* failure with a measurement behind it.
test('no stage rests the bar near full while a long wait is still ahead', () => {
	const total = Object.values(STARTUP_STAGE_WEIGHTS).reduce((sum, share) => sum + share, 0);

	for (const stage of STARTUP_STAGES) {
		const resting = startupProgressFor(stage);
		const remaining = (STARTUP_STAGE_WEIGHTS[stage] / total) * 100;

		assert.ok(
			resting + remaining <= 100.0001,
			`${stage} rests the bar at ${resting} with ${remaining} of the run still to come`
		);

		// the bar may only be near full where what is left is genuinely small.
		if (resting > 90) {
			assert.ok(
				remaining < 10,
				`the bar rests at ${resting} while ${stage} still has ${remaining} percent to run`
			);
		}
	}
});

// The weighting is the point of requirement 16's second half: equal fifths put the bar at four
// fifths while the longest stage was still running.
test('the bar is weighted rather than divided into equal steps', () => {
	const shares = STARTUP_STAGES.map((stage) => STARTUP_STAGE_WEIGHTS[stage]);

	assert.notEqual(
		new Set(shares).size,
		1,
		'the stages carry equal weights, which is the stepped bar this requirement rejects'
	);

	// and not merely unequal: the measurement says two stages dominate, so a table where they did
	// not would mean somebody replaced real numbers with plausible ones.
	const total = shares.reduce((sum, share) => sum + share, 0);
	const largest = Math.max(...shares);

	assert.ok(
		largest / total > 0.4,
		'no stage dominates the run, which the measured launches say is not what happens'
	);
});

// **The easing may never claim a stage is over.** That is the one property the interpolation has
// to hold: a bar that reached the next boundary early would say *finished* while the work ran on,
// which is the lie the whole screen was redesigned to stop telling.
test('filling within a stage approaches the next boundary and never reaches it', () => {
	for (const [index, stage] of STARTUP_STAGES.entries()) {
		const next = STARTUP_STAGES[index + 1];
		const ceiling = next ? startupProgressFor(next) : 100;

		assert.equal(startupProgressWithin(stage, 0), startupProgressFor(stage));

		// on time, four times over, and a hundred times over: none of them may arrive.
		for (const overrun of [1, 4, 100]) {
			const elapsed = STARTUP_STAGE_WEIGHTS[stage] * overrun;
			const filled = startupProgressWithin(stage, elapsed);

			assert.ok(filled < ceiling, `${stage} fills past its own boundary after ${elapsed}ms`);
			assert.ok(filled > startupProgressFor(stage), `${stage} does not fill at all`);
		}
	}
});

test('filling within a stage only ever moves forward', () => {
	for (const stage of STARTUP_STAGES) {
		let previous = -1;

		for (let elapsed = 0; elapsed <= STARTUP_STAGE_WEIGHTS[stage] * 3; elapsed += 50) {
			const filled = startupProgressWithin(stage, elapsed);

			assert.ok(filled >= previous, `${stage} went backwards at ${elapsed}ms`);
			previous = filled;
		}
	}
});
