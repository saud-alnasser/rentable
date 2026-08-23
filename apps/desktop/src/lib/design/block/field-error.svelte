<script lang="ts">
	import * as Form from '@rentable/design/primitive/form/index.js';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';

	/**
	 * A field's validation message, shown where the field is rather than in a list somewhere
	 * else. It marks the field permanently and reveals the text on hover or focus.
	 *
	 * Two parts, and both are load-bearing. The **mark** — this icon, beside the destructive
	 * border the control primitives already draw from `aria-invalid` — is always visible, so
	 * the presence of an error never depends on pointing at anything. The **text** appears on
	 * hover or focus, and carries the id `Form.FieldErrors` generates, which is what keeps it
	 * announced to a screen reader whether or not it is visible.
	 *
	 * The reveal is `group-hover` and `group-focus-within`, so **the field it sits in must
	 * carry `group relative`** — `relative` for the positioning, `group` for the reveal. There
	 * is nothing to render until that field has an error.
	 */
</script>

<Form.FieldErrors class="contents">
	{#snippet children({ errors, errorProps })}
		{#if errors.length > 0}
			<CircleAlertIcon aria-hidden="true" class="absolute end-0 top-0.5 size-4 text-destructive" />

			<div
				class="pointer-events-none absolute end-5 -top-1 z-20 max-w-[calc(100%-2rem)] rounded-lg bg-destructive px-2.5 py-1 text-xs leading-5 font-medium text-white opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
			>
				{#each errors as message (message)}
					<div {...errorProps} role="alert">{message}</div>
				{/each}
			</div>
		{/if}
	{/snippet}
</Form.FieldErrors>
