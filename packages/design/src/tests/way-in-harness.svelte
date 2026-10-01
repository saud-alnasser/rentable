<script lang="ts">
	/**
	 * A caller of the way-in surface, as the screens of the way in are: one component that draws
	 * every step and hands the surface the key of the one it is on.
	 *
	 * Scaffolding rather than a test. The step's field and its button carry the step's name, so a
	 * test can tell the outgoing step's copy from the live contents that replaced it.
	 */
	import WayInSurface from '#lib/block/way-in-surface.svelte';

	let {
		step,
		at,
		back = false,
		named = false,
		returning = false,
		onback = () => undefined
	}: {
		step: string;
		at?: number;
		back?: boolean;
		named?: boolean;
		returning?: boolean;
		onback?: () => void;
	} = $props();
</script>

<WayInSurface
	{step}
	title="title {step}"
	{named}
	description="line {step}"
	position={at === undefined ? undefined : { at, of: 2, label: `step ${at} of 2` }}
	back={back ? { label: 'the way back', onclick: onback } : undefined}
	{returning}
>
	<input data-field aria-label="field {step}" value="typed {step}" />

	{#snippet actions()}
		<button type="button">go {step}</button>
	{/snippet}

	{#snippet foot()}
		<button type="button">language</button>
	{/snippet}
</WayInSurface>
