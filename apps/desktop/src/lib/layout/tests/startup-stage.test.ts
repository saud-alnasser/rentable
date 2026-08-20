import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	STARTUP_STAGES,
	STARTUP_STAGE_WEIGHTS,
	startupProgressFor,
	startupProgressWithin,
	type StartupStage
} from '../startup-stage.ts';

/**
 * THE BAR IS A REPORT, AND THIS IS WHAT MAKES IT ONE
 *
 * Requirement 16 asks that every stage the loading screen names is an await the startup path
 * actually performs, with none invented and none folded away. That is a claim about two files
 * agreeing, so it is checked by reading both rather than by trusting either.
 *
 * **It walks the route's source, not a running startup, and that is a stated limitation.**
 * Startup lives in `routes/+layout.svelte`, which cannot be driven without a window; extracting it
 * into a unit that can is requirement 9's work, and this test upgrades to driving that unit when
 * it lands. What it can already do is catch the two failures the requirement names — a stage the
 * route never reports, and a report the list does not know about — which is the whole of *nothing
 * invented, nothing folded away*.
 */

const ROUTE = fileURLToPath(new URL('../../../routes/+layout.svelte', import.meta.url));

/** every `reportStartupStage('x')` in the route, in the order the file states them. */
function reportedStages(): StartupStage[] {
	const source = readFileSync(ROUTE, 'utf8');
	const found: StartupStage[] = [];

	for (const match of source.matchAll(/reportStartupStage\(\s*'([a-z]+)'\s*\)/g)) {
		found.push(match[1] as StartupStage);
	}

	return found;
}

test('every stage the screen can name is one the startup path reports', () => {
	const reported = new Set(reportedStages());

	for (const stage of STARTUP_STAGES) {
		assert.ok(reported.has(stage), `the bar names ${stage} and the startup path never reports it`);
	}
});

// The other direction, and it is the one that rots quietly: a stage added to the route with no
// entry in the list would leave the bar showing the stage before it while that work ran.
test('every stage the startup path reports is one the screen knows', () => {
	for (const stage of reportedStages()) {
		assert.ok(
			STARTUP_STAGES.includes(stage),
			`the startup path reports ${stage} and the bar has no name or weight for it`
		);
	}
});

// **The order is the requirement, not an incidental.** `settings` before `account` before
// `workspace` is the admission ordering: nothing opens the database before there is an account.
// A bar that walked them in another order would be describing a startup this application does not
// perform.
//
// **Checked per function, because file order is not call order.** `continueStartup` is declared
// above `startApp` and runs after it, so a whole-file scan reports `workspace` first and would
// fail on somebody moving a function without changing a line of it. What each function body can
// say for itself is that the stages *it* reports ascend, which is the real failure this guards:
// two reports swapped in place. Whether one function runs before another is a fact about
// execution, and checking it needs the startup unit requirement 9 extracts.
test('the stages each part of startup reports ascend through the list', () => {
	const source = readFileSync(ROUTE, 'utf8');

	// top-level declarations in the script block carry exactly one tab of indent.
	const bodies = source.split(/\n\t(?:async )?function /);

	let checked = 0;

	for (const body of bodies) {
		const stages = [...body.matchAll(/reportStartupStage\(\s*'([a-z]+)'\s*\)/g)].map((match) =>
			STARTUP_STAGES.indexOf(match[1] as StartupStage)
		);

		if (stages.length < 2) {
			continue;
		}

		checked += 1;

		const ascending = [...stages].sort((a, b) => a - b);

		assert.deepEqual(
			stages,
			ascending,
			`${body.slice(0, body.indexOf('('))} reports its stages out of the declared order`
		);
	}

	assert.ok(
		checked >= 2,
		'no part of the route reports more than one stage, so nothing was checked'
	);
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
