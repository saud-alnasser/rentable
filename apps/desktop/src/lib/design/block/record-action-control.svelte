<script lang="ts" module>
	import type { Tone } from '@rentable/design/tone.js';
	import { tv } from 'tailwind-variants';

	/**
	 * Whether pressing this control destroys something the reader cannot get back.
	 *
	 * **Two of the application's five tones, named from that vocabulary rather than beside it.**
	 * *It said `destructive` until 2026-08-20, which was a sixth name for the thing four other
	 * components each called something else.* The other three are absent because no record action
	 * has ever been one — a control that succeeds or informs is not an action, it is the result of
	 * one — and a variant nothing asks for is a shape the next caller fills for a reason nobody
	 * argued.
	 */
	export type RecordActionTone = Extract<Tone, 'neutral' | 'error'>;

	// deleting and terminating rest as quietly as every other control here and take the warning
	// colour on the intent to press: each is primary only inside the confirmation it opens
	// (_Semantics are secondary_). A red glyph at rest would be the only chroma on the surface and
	// would pull the eye to the one control nobody came for, and the icon already says what the
	// action is (_Don't rely on color alone_). Resting a step quieter than its neighbours
	// counterbalances how heavy an icon reads (_Balance weight and contrast_).
	const control = tv({
		base: 'rounded-full bg-secondary',
		variants: {
			tone: {
				neutral: '',
				// `error` draws `--destructive`, which is the token's shadcn name and stays: the
				// vocabulary is what got a shared word, not every colour underneath it.
				error:
					'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive'
			} satisfies Record<RecordActionTone, string>
		}
	});
</script>

<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import type { Component } from 'svelte';

	/**
	 * One control in a record's action cluster.
	 *
	 * A record names the action, its glyph, and whether it destroys something; what the control
	 * looks like is decided here and nowhere else. Every record offering the same action must
	 * offer it looking the same, and the treatment used to be a class string each record carried
	 * its own copy of — which cost two separate rounds of editing five files to change one
	 * appearance.
	 *
	 * It stays a button in the surface's own seam, so the keyboard reaches it by tabbing where it
	 * already goes ([ADR 0032](../../decisions/0032-the-record-surface-is-one-shell.md)).
	 */
	let {
		label,
		icon: Icon,
		tone = 'neutral',
		onclick
	}: {
		/** What the action is, translated — the tooltip, and the control's accessible name. */
		label: string;
		/** The glyph standing for the action. */
		icon: Component<{ class?: string }>;
		tone?: RecordActionTone;
		onclick: () => void;
	} = $props();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				class={control({ tone })}
				aria-label={label}
				{onclick}
			>
				<Icon class="size-4" />
				<span class="sr-only">{label}</span>
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>{label}</Tooltip.Content>
</Tooltip.Root>
