<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
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

	/**
	 * Light, dark, or the system's, as three buttons that apply the moment one is pressed.
	 *
	 * Three and not a menu, because all three fit and a reader choosing between them wants to see
	 * them side by side. What is shown pressed is the choice being written while it is, so the
	 * group does not jump back to the old one for the length of the round trip.
	 */
	let { stored }: { stored: AppearanceSetting } = $props();

	const setAppearance = useSetAppearance();

	const current = $derived(
		setAppearance.isPending && setAppearance.variables ? setAppearance.variables.appearance : stored
	);

	const icons = { system: MonitorIcon, light: SunIcon, dark: MoonIcon };
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Label id="app-appearance-label">
			<span class="first-letter:uppercase">{$LL.settings.appearanceTitle()}</span>
		</Field.Label>
		<Field.Description>{$LL.settings.appearanceDescription()}</Field.Description>
	</Field.Content>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		aria-labelledby="app-appearance-label"
		class="w-full sm:w-56"
		value={current}
		onValueChange={(value) => {
			// pressing the one already chosen would unset a single group; there is always a choice.
			if (!value || value === current) return;

			setAppearance.mutate({ appearance: toAppearanceSetting(value) });
		}}
	>
		{#each APPEARANCES as appearance (appearance)}
			{@const Icon = icons[appearance]}
			<ToggleGroup.Item value={appearance} class="flex-1 capitalize" data-appearance={appearance}>
				<Icon class="size-4" />
				{$LL.settings.appearance[appearance]()}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
</Field.Field>
