/**
 * The stages a startup passes through, and how much of the wait each one is.
 *
 * The loading screen shows a bar rather than a spinner, and a bar only beats a spinner if it is
 * true: indefinite motion looks identical at half a second and at forty, so a person watching it
 * cannot tell working from hung, while a bar that has moved since they last looked can only mean
 * one thing. That is the whole reason this module exists, and the reason it may not be faked.
 *
 * **The five below are the awaits `routes/+layout.svelte` already performs, in the order it
 * performs them.** Nothing may be invented to fill the bar out and nothing real may be folded
 * away — a bar naming a step the application does not take is a decoration wearing a report's
 * clothes. `tests/startup-stage.test.ts` holds that to the route rather than to good intentions.
 *
 * One consequence worth knowing before reading the screen: **signing in and retrying a session
 * re-enter at `workspace`**, because that is where `continueStartup` begins. The bar starts those
 * paths partway along, which is honest.
 *
 * *Plain rather than `.svelte.ts` deliberately: none of this is reactive, and a runes file cannot
 * be imported by a `node:test` at all. What is reactive is the current stage, and that is the
 * whole of `startup-stage.svelte.ts`.*
 */

export const STARTUP_STAGES = ['settings', 'account', 'workspace', 'changes', 'records'] as const;

export type StartupStage = (typeof STARTUP_STAGES)[number];

/**
 * What each stage costs, in milliseconds, measured rather than divided.
 *
 * **These are real timings from this machine on 2026-08-20**, read off the `startup.stage` lines
 * `reportStartupStage` writes. Four launches were recorded, one cold and three warm:
 *
 * ```
 * stage       cold     warm            taken
 * settings      26    5  12  25           26
 * account        6    8   8   5            8
 * workspace   2117 1338 1308 1743       2117
 * changes     3595  355 396  339        3595
 * records        -  153 157   *           157
 * ```
 *
 * **The cold figure wins wherever there is one**, because the two directions of error are not
 * equal: weights taken from a warm launch leave a cold one stuck near the end of the bar, which is
 * the failure this requirement exists to prevent, while cold weights merely let a warm launch
 * finish early.
 *
 * *The `*` is a 7017ms `records` on the run right after five thousand tenants were seeded. It is a
 * real measurement of a reconcile with a workspace's worth of new rows to walk, and it is left out
 * because it is a cost of the data rather than of starting: a launch does not get slower for being
 * cold, it gets slower for having something to reconcile. `records` therefore carries the
 * steady-state figure, and it is the one number here with a caveat on it.*
 *
 * **Two stages are under thirty milliseconds and the bar will not visibly move for them.** That is
 * the truth of this launch rather than a defect in the scale: reading settings and asking who is
 * signed in genuinely cost nothing next to opening the workspace. The stage name and the counter
 * carry those two, which is what they are for.
 *
 * Milliseconds rather than normalised shares so the table above can be checked against the file
 * without arithmetic, and so re-measuring is a matter of pasting new numbers in.
 */
export const STARTUP_STAGE_WEIGHTS: Record<StartupStage, number> = {
	settings: 26,
	account: 8,
	workspace: 2117,
	changes: 3595,
	records: 157
};

const TOTAL_WEIGHT = Object.values(STARTUP_STAGE_WEIGHTS).reduce((sum, share) => sum + share, 0);

/**
 * How full the bar is while a stage is running, as a percentage.
 *
 * **What is behind the reader, never including the stage they are waiting on.** This is the whole
 * difference between a bar that reports and a bar that lies: counting the current stage as done
 * would put the bar at 97 percent for the three and a half seconds `changes` takes on a cold
 * launch, which is precisely the *walks to nearly full and then waits* that requirement 16 rejects
 * — and it would be worse than equal fifths rather than better.
 *
 * So the bar moves at each boundary and rests at a figure the remaining work can justify. Reaching
 * the last stage leaves it short of full, which is correct: the screen is replaced by the shell
 * rather than ever showing a completed bar.
 */
export function startupProgressFor(stage: StartupStage): number {
	const reached = STARTUP_STAGES.indexOf(stage);
	const behind = STARTUP_STAGES.slice(0, reached).reduce(
		(sum, name) => sum + STARTUP_STAGE_WEIGHTS[name],
		0
	);

	return (behind / TOTAL_WEIGHT) * 100;
}

/**
 * Where the bar sits partway through a stage.
 *
 * **The stages are too few and too uneven to leave it at the boundaries.** On the measured cold
 * launch the bar would move exactly twice in six seconds and stand still between, and a reader who
 * looks away and back inside a stage sees nothing move — which is the spinner's failure wearing a
 * bar's clothes, and the whole argument for this screen was that a bar cannot fail that way.
 *
 * **It approaches the next boundary and never arrives.** The share of the stage that has elapsed
 * is `1 - exp(-elapsed / expected)`, which is fast at first and slower the longer it runs: a stage
 * finishing on time lands the bar around two thirds of the way across its own span, and a stage
 * that takes four times as long still has somewhere to go. Nothing here can claim a stage is done
 * before the startup path says so, which is the property that matters — the alternative, a linear
 * fill that hits the boundary and stops, would say *finished* while the work continued.
 *
 * **The last tenth of a stage's span belongs to the stage ending**, and nothing else may spend it.
 * The curve alone is not enough: `1 - exp(-elapsed / expected)` is indistinguishable from 1 once a
 * stage runs long, and in floating point it *is* 1, so a stage taking a hundred times its estimate
 * would land the bar exactly on the next boundary and report work that had not happened. Holding a
 * tenth back makes that structural rather than a property of the arithmetic. A test pins it.
 *
 * `elapsedMs` is milliseconds since the stage was reported. The estimate is worth exactly as much
 * as [`STARTUP_STAGE_WEIGHTS`] is, which is why those are measured.
 */
const SPAN_RESERVED_FOR_FINISHING = 0.1;

export function startupProgressWithin(stage: StartupStage, elapsedMs: number): number {
	const from = startupProgressFor(stage);
	const span = (STARTUP_STAGE_WEIGHTS[stage] / TOTAL_WEIGHT) * 100;
	const expected = STARTUP_STAGE_WEIGHTS[stage];

	if (elapsedMs <= 0 || expected <= 0) {
		return from;
	}

	const reachable = span * (1 - SPAN_RESERVED_FOR_FINISHING);

	return from + reachable * (1 - Math.exp(-elapsedMs / expected));
}
