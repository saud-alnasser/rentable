<script lang="ts">
	/**
	 * A form surface, open, with the fields and the actions a form supplies.
	 *
	 * Scaffolding rather than a test. The subject takes two snippets, and a snippet is the one
	 * kind of prop a `.ts` test cannot write; the title is the form's own rather than the
	 * contract's, so it is supplied here beside them.
	 *
	 * It holds `open` the way a form's caller does, so a close the surface lets through is one
	 * the test can see go. The cancel is wired the way every form wires its own, to the
	 * `requestClose` the surface hands its actions, and the submit closes through the form's own
	 * path, setting `open` itself, as a form's submit handler does once its write lands.
	 */
	import FormSurface from '#lib/block/form-surface.svelte';
	import type { Action } from 'svelte/action';

	let {
		dirty = false,
		onOpenChange = () => {}
	}: {
		dirty?: boolean;
		/** told of every close the surface lets through, beside the state this holds. */
		onOpenChange?: (value: boolean) => void;
	} = $props();

	let open = $state(true);

	const enhance: Action<HTMLFormElement> = (form) => {
		const submit = (event: SubmitEvent) => {
			event.preventDefault();
			open = false;
		};

		form.addEventListener('submit', submit);

		return { destroy: () => form.removeEventListener('submit', submit) };
	};
</script>

<FormSurface
	{open}
	onOpenChange={(value) => {
		open = value;
		onOpenChange(value);
	}}
	{dirty}
	weight="light"
	title="a title"
	{enhance}
>
	<input aria-label="a field" data-field />

	{#snippet actions({ requestClose })}
		<button type="button" data-cancel onclick={requestClose}>an action</button>
		<button type="submit" data-submit>a submit</button>
	{/snippet}
</FormSurface>
