<script lang="ts">
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		APPEARANCES,
		toAppearanceSetting,
		type AppearanceSetting
	} from '$lib/platform/appearance';
	import { useSetAppearance } from '$lib/settings/query';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SunIcon from '@lucide/svelte/icons/sun';
	import SunMoonIcon from '@lucide/svelte/icons/sun-moon';
	import type { Component } from 'svelte';

	/**
	 * Light, dark, or the system's, as three buttons that apply the moment one is pressed.
	 *
	 * Three and not a menu, because all three fit and a reader choosing between them wants to see
	 * them side by side. In the settings it is a row of the general section, labelled by the row's
	 * name. What is shown pressed is the choice being written while it is, so the group does not
	 * jump back to the old one for the length of the round trip.
	 *
	 * **The choice explains itself, and *system* says what it follows in its own tooltip** (effort
	 * 846, requirement 1 as revised on 2026-10-02, at the human's word: "on the appearnce the
	 * explaintion on the button feels ood"). Light and dark name what they do; system is the one
	 * whose effect is not in its word, so it alone carries a short hint, on hover and focus, where
	 * the reader who wonders looks ([[contexts/desktop/components]], `primitive/tooltip`: a short
	 * hint). *A sentence at the foot of the card said it for every choice until ticket 31 of effort
	 * 846.*
	 */
	let {
		stored,
		bare = false
	}: {
		stored: AppearanceSetting;
		/**
		 * the three buttons alone, named for a screen reader and not on screen: the way in's foot
		 * control draws them under the language with nothing above them (effort 843, at the human's
		 * word on 2026-10-01, who found the title and its sentence too much there).
		 */
		bare?: boolean;
	} = $props();

	const setAppearance = useSetAppearance();

	const current = $derived(
		setAppearance.isPending && setAppearance.variables ? setAppearance.variables.appearance : stored
	);

	const icons = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };
</script>

{#snippet segment(
	appearance: (typeof APPEARANCES)[number],
	Icon: Component<{ class?: string }>,
	props: Record<string, unknown>
)}
	<ToggleGroup.Item
		{...props}
		value={appearance}
		class="flex-1 capitalize"
		data-appearance={appearance}
	>
		<Icon class="size-4" />
		{$LL.settings.appearance[appearance]()}
	</ToggleGroup.Item>
{/snippet}

{#snippet choice(labelled: Record<string, string>, className: string)}
	<ToggleGroup.Root
		type="single"
		variant="outline"
		{...labelled}
		class={className}
		value={current}
		onValueChange={(value) => {
			// pressing the one already chosen would unset a single group; there is always a choice.
			if (!value || value === current) return;

			setAppearance.mutate({ appearance: toAppearanceSetting(value) });
		}}
	>
		{#each APPEARANCES as appearance (appearance)}
			{@const Icon = icons[appearance]}
			{#if appearance === 'system'}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							{@render segment(appearance, Icon, props)}
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8} data-appearance-hint>
						{$LL.settings.appearanceSystemHint()}
					</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				{@render segment(appearance, Icon, {})}
			{/if}
		{/each}
	</ToggleGroup.Root>
{/snippet}

{#if bare}
	{@render choice({ 'aria-label': $LL.settings.appearanceTitle() }, 'w-full')}
{:else}
	<SettingsRow icon={SunMoonIcon} name={$LL.settings.appearanceTitle()}>
		{#snippet control({ labelId })}
			{@render choice({ 'aria-labelledby': labelId }, 'w-56 sm:w-72')}
		{/snippet}
	</SettingsRow>
{/if}
