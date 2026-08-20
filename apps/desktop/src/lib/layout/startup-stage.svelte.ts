import { recordDiagnosticInfo } from '$lib/platform/diagnostics';
import { type StartupStage } from './startup-stage';

/**
 * Where startup has got to, as the loading screen reads it.
 *
 * The vocabulary, the weights and the arithmetic are `./startup-stage`, which is a plain module so
 * that a `node:test` can hold them to the route. What is here is the one reactive thing and the
 * one side effect: which stage the application is on, and the record of how long the last one took.
 */

export {
	STARTUP_STAGES,
	STARTUP_STAGE_WEIGHTS,
	startupProgressFor,
	startupProgressWithin
} from './startup-stage';
export type { StartupStage } from './startup-stage';

/**
 * The stage, and when it started.
 *
 * `since` is here rather than in the screen because the screen mounts after the first stage is
 * already reported: a component measuring from its own mount would time the wrong thing.
 */
export const startupStage = $state<{ current: StartupStage; since: number }>({
	current: 'settings',
	since: Date.now()
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

	previous = stage;
	enteredAt = now;

	startupStage.current = stage;
	startupStage.since = now;
}

/**
 * Say that startup finished, so the last stage gets timed too.
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
