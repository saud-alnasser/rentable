<script lang="ts">
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { countFigure } from '$lib/design/cell/count.svelte';
	import { statusGlyphs, statusTones, type StatusName } from '$lib/design/cell/status.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleNumber } from '$lib/platform/locale';

	/**
	 * How many records a row holds in one status: the status's own glyph, the figure, and the
	 * status naming itself on hover and to a screen reader.
	 *
	 * Distinct from the count beside it because everything about it is derived rather than
	 * given — a caller supplies the status and the number, and the glyph, the name and the
	 * colour all come from the one vocabulary the rest of the application reads statuses by.
	 * That is the point of it: a figure counting defaulted contracts cannot end up a different
	 * colour from the defaulted glyph on the contracts list.
	 *
	 * `label` is the form a tile draws: the figure with its word, as the caller's locale says it,
	 * written beside the glyph in place of the bare figure. A tile is scanned rather than read down
	 * a column, so there is no column to recognise a bare figure by (the same reason `Cell.Status`
	 * has its labelled form). The caller owns the words, because what is counted is the caller's:
	 * the status's own word names the status, not a number of things in it.
	 */
	let {
		status,
		count,
		label
	}: {
		status: StatusName;
		count: number;
		/** the figure and its word, drawn in place of the bare figure, as a tile draws a count. */
		label?: string;
	} = $props();

	const Glyph = $derived(statusGlyphs[status]);
	const figure = $derived(formatLocaleNumber($locale, count));
	const name = $derived($LL.common.status[status]());

	// nothing in this status reads quiet, whatever colour the status carries. A row shows every
	// status including the ones at zero, so most figures on most rows are zero — and a zero in
	// the destructive colour would say a tenant is in trouble on the strength of having no
	// trouble at all. Colour here reports a quantity that exists, not a category that could.
	const tone = $derived(count > 0 ? statusTones[status] : 'text-muted-foreground');
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<!-- pointer-events-auto for the same reason the status and count cells carry it: a
			     surface may lay a click target over its content and disable pointer events
			     beneath, and a figure whose name is only reachable by hovering is unreadable
			     there without this. -->
			{#if label}
				<span
					{...props}
					data-status-count={status}
					class="pointer-events-auto flex shrink-0 items-center gap-1.5 text-xs font-medium {tone}"
				>
					<Glyph class="size-4" aria-hidden="true" />
					<span class="tabular-nums">{label}</span>
				</span>
			{:else}
				<span
					{...props}
					class="pointer-events-auto flex shrink-0 items-center gap-1.5 text-xs {tone}"
				>
					<Glyph class="size-4" aria-hidden="true" />
					<span class={countFigure} aria-hidden="true">{figure}</span>
					<span class="sr-only">{name}: {figure}</span>
				</span>
			{/if}
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={6}>
		{name}
	</Tooltip.Content>
</Tooltip.Root>
