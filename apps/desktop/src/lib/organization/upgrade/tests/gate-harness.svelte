<script lang="ts">
	import { CreateControl } from '$lib/create/ui';
	import { useUpgraded } from '$lib/organization/upgrade/gate';
	import type { GatedStep } from '$lib/organization/upgrade/upgrade';

	/**
	 * A capability gated on an upgrade step, as one would be drawn: the create control a set draws,
	 * refused with the gate's reason until the step has run. Scaffolding for
	 * `./gate.svelte.test.ts`, which cannot call the hook outside a component.
	 */
	let { step, onCreate }: { step: GatedStep; onCreate: () => void } = $props();

	// svelte-ignore state_referenced_locally
	const gate = useUpgraded(step);
</script>

<div data-gated={gate.upgraded ? 'upgraded' : 'waiting'}>
	<CreateControl label="record a refund" {onCreate} unavailable={gate.reason} data-gated-control />
</div>
