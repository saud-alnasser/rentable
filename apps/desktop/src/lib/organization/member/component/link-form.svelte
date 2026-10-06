<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Slider } from '@rentable/design/primitive/slider/index.js';
	import { onSubmit } from '$lib/form';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		DEFAULT_LINK_LIFETIME_HOURS,
		LINK_LIFETIME_HOURS,
		formatLinkLifetime
	} from '$lib/organization/member/link-lifetime';
	import LinkIcon from '@lucide/svelte/icons/link';

	/**
	 * Making a link: how long it and its code last, chosen before it is made (effort 851,
	 * requirement 11).
	 *
	 * **One choice, and it starts where most people would leave it.** Every hour from one to
	 * twenty-three, every day from one to six, then a week, shortest first, at three days until
	 * changed. A length of time from fixed steps is a slider with the chosen value written beside it
	 * ([[rules/interface]], *Field kinds*): the thumb runs over the thirty steps by their place in
	 * the list, the label's row ends with the lifetime it stands on, the two ends are named under the
	 * track, and the sentence under them says what the choice does: the pair stops working together.
	 * What is made is shown on the handover panel (`made-link.svelte`), which prints the moment it
	 * lapses.
	 *
	 * **Light, on the shared form surface** ([[rules/interface]], *Form surface*): one value, declared
	 * rather than measured.
	 *
	 * **The mutation is the caller's.** This owns the choice and hands the hours up through
	 * `onMake`; the member host makes the link, closes this and opens the handover.
	 */
	let {
		open,
		onOpenChange,
		username,
		isMaking,
		onMake
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the account the link is for, named under the title. */
		username: string;
		/** the link is being made, which is a moment a person is waiting on. */
		isMaking: boolean;
		onMake: (lifetimeHours: number) => void;
	} = $props();

	const DEFAULT_STEP = LINK_LIFETIME_HOURS.indexOf(DEFAULT_LINK_LIFETIME_HOURS);
	const LAST_STEP = LINK_LIFETIME_HOURS.length - 1;

	/** where the thumb stands: a place in `LINK_LIFETIME_HOURS`, not a number of hours. */
	let step = $state(DEFAULT_STEP);

	const chosen = $derived(LINK_LIFETIME_HOURS[step]);
	const shown = $derived(formatLinkLifetime($locale, chosen));

	// every link starts at the default: a lifetime chosen for one account is not a setting.
	$effect(() => {
		if (!open) step = DEFAULT_STEP;
	});

	const enhance = onSubmit(() => {
		if (!isMaking) onMake(chosen);
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.organization.dashboard.makeLink()}
	description={$LL.organization.dashboard.linkFor({ username })}
>
	<Field.Field data-link-lifetime={chosen}>
		<div class="flex items-baseline justify-between gap-4">
			<Field.Label id="link-lifetime-label">
				{$LL.organization.dashboard.linkLifetime()}
			</Field.Label>
			<span data-link-lifetime-shown class="text-sm font-medium tabular-nums">{shown}</span>
		</div>
		<Slider
			bind:value={step}
			min={0}
			max={LAST_STEP}
			step={1}
			disabled={isMaking}
			thumbLabelledby="link-lifetime-label"
			valueText={shown}
			class="py-2"
		/>
		<div class="-mt-1 flex justify-between gap-4 text-xs text-muted-foreground">
			<span data-link-lifetime-end="first">
				{formatLinkLifetime($locale, LINK_LIFETIME_HOURS[0])}
			</span>
			<span data-link-lifetime-end="last">
				{formatLinkLifetime($locale, LINK_LIFETIME_HOURS[LAST_STEP])}
			</span>
		</div>
		<Field.Description>{$LL.organization.dashboard.linkLifetimeDescription()}</Field.Description>
	</Field.Field>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isMaking} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={isMaking}>
			<LinkIcon class="size-4" />
			{isMaking ? $LL.common.actions.working() : $LL.organization.dashboard.makeLink()}
		</Button>
	{/snippet}
</FormSurface>
