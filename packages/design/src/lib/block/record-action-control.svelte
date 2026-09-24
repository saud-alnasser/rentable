<script lang="ts" module>
	import type { Tone } from '#lib/tone.js';
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

	/**
	 * What an unavailable control wears over the button's own disabled look.
	 *
	 * The button stops taking the pointer once it is marked disabled, which is right for a control
	 * that is simply off and wrong for one that has to say why: its reason is in the tooltip, and a
	 * control that never takes the pointer never opens it. So it takes the pointer back, shows the
	 * cursor that says it will not run, and stays dimmed ([[rules/interface]], *Guidance*).
	 */
	export const unavailableControl =
		'aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed';
</script>

<script lang="ts">
	import { Button } from '#lib/primitive/button/index.js';
	import { Kbd } from '#lib/primitive/kbd/index.js';
	import * as Tooltip from '#lib/primitive/tooltip/index.js';
	import { toShortcutHint, usesAppleKeyboard, type ShortcutCombination } from '#lib/shortcut.js';
	import { cn } from '#lib/tailwind.js';
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
		shortcut,
		disabled = false,
		unavailable,
		onclick
	}: {
		/** What the action is, translated — the tooltip, and the control's accessible name. */
		label: string;
		/** The glyph standing for the action. */
		icon: Component<{ class?: string }>;
		tone?: RecordActionTone;
		/** The keys that also run it, printed in the tooltip beside its name. */
		shortcut?: ShortcutCombination;
		/** Whether it cannot be pressed for now, because it is already running. */
		disabled?: boolean;
		/**
		 * Why it cannot run for this record, in one line, or nothing where it can. An unavailable
		 * control stays where it is and stays reachable, so hovering or focusing it says why.
		 */
		unavailable?: string;
		onclick: () => void;
	} = $props();

	// what names the reason to assistive technology, which hears it when the control takes focus
	// whether or not the tooltip is drawn.
	const reasonId = $props.id();
</script>

<Tooltip.Root>
	<Tooltip.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				size="icon-sm"
				class={cn(control({ tone }), unavailable && unavailableControl)}
				aria-label={label}
				aria-disabled={unavailable ? 'true' : undefined}
				aria-describedby={unavailable ? reasonId : undefined}
				data-unavailable={unavailable ? '' : undefined}
				{disabled}
				onclick={() => {
					if (!unavailable) {
						onclick();
					}
				}}
			>
				<Icon class="size-4" />
				<span class="sr-only">{label}</span>
				{#if unavailable}
					<span id={reasonId} class="sr-only">{unavailable}</span>
				{/if}
			</Button>
		{/snippet}
	</Tooltip.Trigger>
	<Tooltip.Content side="top" sideOffset={8}>
		{label}
		{#if shortcut}
			<!-- a key name is not prose, so it reads left to right in both locales. -->
			<Kbd dir="ltr">{toShortcutHint(shortcut, usesAppleKeyboard())}</Kbd>
		{/if}
		{#if unavailable}
			<!-- the reason, on its own line under the name: what the control is, then why it will not
			     run now. -->
			<span class="block opacity-80" data-unavailable-reason>{unavailable}</span>
		{/if}
	</Tooltip.Content>
</Tooltip.Root>
