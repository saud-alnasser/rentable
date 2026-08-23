<script lang="ts">
	/**
	 * A form surface, open, with the fields and the actions a form supplies.
	 *
	 * Scaffolding rather than a test. The subject takes two snippets, and a snippet is the one
	 * kind of prop a `.ts` test cannot write; the title is the form's own rather than the
	 * contract's, so it is supplied here beside them.
	 */
	import FormSurface from '#lib/block/form-surface.svelte';
</script>

<FormSurface open onOpenChange={() => {}} weight="light" title="a title" enhance={() => {}}>
	<p>a field</p>

	{#snippet actions()}
		<button type="button">an action</button>
	{/snippet}
</FormSurface>
