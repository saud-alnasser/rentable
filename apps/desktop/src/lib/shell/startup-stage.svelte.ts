import { recordDiagnosticInfo } from '$lib/platform/diagnostics';
import { STARTUP_STAGES, stagesOfPass, type StartupStage } from './startup-stage';

/**
 * Where startup has got to, as the loading screen reads it.
 *
 * The vocabulary, the weights and the arithmetic are `./startup-stage`, which is a plain module so
 * that a `node:test` can hold them to the route. What is here is the one reactive thing and the
 * one side effect: which stage the application is on, and the record of how long the last one took.
 */

export {
	PREPARED_STAGES,
	STARTUP_STAGES,
	STARTUP_STAGE_WEIGHTS,
	startupProgressFor,
	startupProgressWithin
} from './startup-stage';
export type { StartupStage } from './startup-stage';

/**
 * The stage, when it started, and the pass it is a stage of.
 *
 * `since` is here rather than in the screen because the screen mounts after the first stage is
 * already reported: a component measuring from its own mount would time the wrong thing. `stages`
 * is here for the same reason: which pass is running is known where the stage is reported, and
 * the screen counts and weighs over it.
 */
export const startupStage = $state<{
	current: StartupStage;
	since: number;
	stages: readonly StartupStage[];
}>({
	current: 'settings',
	since: Date.now(),
	stages: STARTUP_STAGES
});

let enteredAt: number | null = null;
let previous: StartupStage | null = null;

/**
 * Say which stage startup has reached, and write down what the last one cost.
 *
 * **The timing is what keeps the weights honest.** `STARTUP_STAGE_WEIGHTS` came from launching the
 * application cold and warm and reading these lines back; without them the next person to doubt
 * the numbers has nothing to do but guess again. Written at `info` because a measurement is not a
 * fault, and only where there is a previous stage to have timed.
 */
export function reportStartupStage(stage: StartupStage) {
	const now = Date.now();

	timeTheStageBefore(now);

	// a pass is running while a stage before this one has not been closed by `reportStartupComplete`.
	const stages = stagesOfPass(stage, startupStage.stages, previous !== null);

	previous = stage;
	enteredAt = now;

	startupStage.current = stage;
	startupStage.since = now;
	startupStage.stages = stages;
}

/**
 * Say that startup finished, so the last stage gets timed too. *Also said where a prepared pass
 * ends at its first stage, because the `prepare` it ran failed: the pass is over, and what it cost
 * is still a measurement.*
 *
 * **Without this the final stage is the one stage never measured**, because what times a stage is
 * the next one starting and nothing follows the last. That left `records` as the only weight in
 * the table with no measurement behind it, which is exactly the guess the whole approach refuses.
 */
export function reportStartupComplete() {
	timeTheStageBefore(Date.now());

	previous = null;
	enteredAt = null;
}

function timeTheStageBefore(now: number) {
	if (previous === null || enteredAt === null) {
		return;
	}

	recordDiagnosticInfo('startup.stage', { stage: previous, tookMs: String(now - enteredAt) });
}
