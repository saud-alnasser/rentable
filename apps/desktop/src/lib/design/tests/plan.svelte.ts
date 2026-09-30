// The deletion plan the complex host reads, as rune state, so a test can move it while the host
// is mounted and the host reads it again, as it does when a write refetches the plan. Not a
// `*.test.ts` file, so the runner does not pick it up directly.

type Plan = {
	eligible: string[];
	refused: { id: string; name: string; reason: string }[];
	units: number;
};

export const complexPlan = $state<{ plan: Plan; fetching: boolean }>({
	plan: { eligible: [], refused: [], units: 0 },
	fetching: false
});
