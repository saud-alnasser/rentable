<script lang="ts">
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useSetEndingSoonNoticeDays } from '$lib/settings/ui';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import CalendarCogIcon from '@lucide/svelte/icons/calendar-cog';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/**
	 * The ending-soon window, set from the section it fills (effort 846, requirements 6 and 7).
	 *
	 * A quiet glyph at the end of the ending-soon section's header, opening the number of days in a
	 * popover. **A change applies in place, with no save step**: it is written a short wait after
	 * the last keystroke or step, and the section, the band and every other reading of the rank
	 * refresh under it. An invalid value marks its own field and is not written; a write the shell
	 * refuses is said by the shared handler, and the field goes back to the figure as it stands.
	 *
	 * The figure stays a setting of this machine, as it was when the settings area held it.
	 */
	let {
		days,
		open = $bindable(false)
	}: {
		/** the figure as the dashboard's read last answered it. */
		days: number;
		/** whether the popover is showing; the command menu's place opens it through the address. */
		open?: boolean;
	} = $props();

	/** how long after the last change the figure is written, so typing 90 does not write 9 first. */
	const WRITE_DELAY_MS = 400;

	const setDays = useSetEndingSoonNoticeDays();

	// what the reader has entered and not yet seen land: nothing while the field shows the figure
	// as it stands, `null` while it holds no number at all.
	let draft = $state<number | null | undefined>(undefined);

	const isWhole = (value: number | null | undefined): value is number =>
		typeof value === 'number' && Number.isInteger(value) && value > 0;

	const shown = $derived(draft === undefined ? days : draft);
	const invalid = $derived(draft !== undefined && !isWhole(draft));
	// the steppers count from what the field holds where it holds a figure, and from the figure as
	// it stands where it does not.
	const base = $derived(isWhole(shown) ? shown : days);

	const fieldId = $props.id();
	const errorId = `${fieldId}-error`;

	// a value that is the figure as it stands is no draft: there is nothing to write, and the field
	// goes on following the figure.
	function propose(next: number | null) {
		draft = next === days ? undefined : next;
	}

	function enter(raw: string) {
		propose(raw.trim() === '' ? null : Number(raw));
	}

	async function write(next: number) {
		try {
			await setDays.mutateAsync({ days: next });
		} catch {
			// the shared handler has said why. Nothing was written, so the field shows the figure
			// as it stands, unless the reader has entered another since.
		}

		if (draft === next) {
			draft = undefined;
		}
	}

	$effect(() => {
		const next = draft;

		if (!isWhole(next)) {
			return;
		}

		const timeout = setTimeout(() => void write(next), WRITE_DELAY_MS);

		return () => clearTimeout(timeout);
	});
</script>

<Popover.Root bind:open>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props: tooltipProps })}
				<Popover.Trigger {...tooltipProps}>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="shrink-0 text-muted-foreground"
							aria-label={$LL.dashboard.endingSoon.change()}
							data-ending-soon-control
						>
							<CalendarCogIcon class="size-4" aria-hidden="true" />
						</Button>
					{/snippet}
				</Popover.Trigger>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" sideOffset={8}>
			{$LL.dashboard.endingSoon.change()}
		</Tooltip.Content>
	</Tooltip.Root>

	<Popover.Content align="end" collisionPadding={16} class="flex flex-col gap-3" data-ending-soon>
		<!-- the field marks its own error, as every field does ([[rules/interface]], *Validation
		     errors*): the destructive border from `aria-invalid`, a mark on the label line, and the
		     message on hover or focus. `group relative` is what places and reveals the last two. -->
		<div class="group relative flex flex-col gap-2">
			<label for={fieldId} class="text-sm font-medium first-letter:uppercase">
				{$LL.dashboard.endingSoon.title()}
			</label>

			{#if invalid}
				<CircleAlertIcon
					aria-hidden="true"
					class="absolute end-0 top-0.5 size-4 text-destructive"
				/>
				<div
					class="pointer-events-none absolute end-5 -top-1 z-20 max-w-[calc(100%-2rem)] rounded-lg bg-destructive px-2.5 py-1 text-xs leading-5 font-medium text-white opacity-0 shadow-overlay transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
				>
					<div id={errorId} role="alert">{$LL.dashboard.endingSoon.invalid()}</div>
				</div>
			{/if}

			<InputGroup.Root>
				<InputGroup.Addon align="inline-start">
					<InputGroup.Button
						size="icon-xs"
						aria-label={$LL.dashboard.endingSoon.fewer()}
						disabled={base <= 1}
						onclick={() => propose(Math.max(1, base - 1))}
					>
						<MinusIcon />
					</InputGroup.Button>
				</InputGroup.Addon>
				<InputGroup.Input
					id={fieldId}
					type="number"
					inputmode="numeric"
					min="1"
					step="1"
					class="text-center tabular-nums"
					value={shown ?? ''}
					aria-invalid={invalid ? 'true' : undefined}
					aria-describedby={invalid ? errorId : undefined}
					oninput={(event) => enter(event.currentTarget.value)}
				/>
				<InputGroup.Addon align="inline-end">
					<InputGroup.Text>{$LL.dashboard.endingSoon.days()}</InputGroup.Text>
					<InputGroup.Button
						size="icon-xs"
						aria-label={$LL.dashboard.endingSoon.more()}
						onclick={() => propose(base + 1)}
					>
						<PlusIcon />
					</InputGroup.Button>
				</InputGroup.Addon>
			</InputGroup.Root>
		</div>

		<p class="text-xs text-muted-foreground first-letter:uppercase">
			{$LL.dashboard.endingSoon.description()}
		</p>
	</Popover.Content>
</Popover.Root>
