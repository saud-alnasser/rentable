<script lang="ts">
	import SettingsRow from '@rentable/design/block/settings-row.svelte';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { locales } from '$lib/i18n/i18n-util';
	import LanguagesIcon from '@lucide/svelte/icons/languages';

	/**
	 * The language, as a row of the general section whose control is one button per language,
	 * applied the moment it is pressed.
	 *
	 * Buttons and not a menu, as the appearance beside it is: two choices fit, and a reader
	 * choosing between them wants to see both ([[rules/interface]], *Field kinds*). Each language
	 * is named in its own words, so a reader who cannot read the current one still finds theirs.
	 * The row's name labels the group, and no sentence explains it: a language applies the moment
	 * it is pressed, which the reader sees (effort 846, requirement 1 as revised on 2026-10-02).
	 */
	let {
		currentLocale,
		onChange
	}: {
		currentLocale: Locales;
		onChange: (locale: Locales) => Promise<void> | void;
	} = $props();

	const isLocale = (value: string): value is Locales =>
		(locales as readonly string[]).includes(value);
</script>

<SettingsRow icon={LanguagesIcon} name={$LL.settings.localeTitle()}>
	{#snippet control({ labelId })}
		<ToggleGroup.Root
			type="single"
			variant="outline"
			id="app-locale"
			aria-labelledby={labelId}
			class="w-44 sm:w-56"
			bind:value={
				() => currentLocale,
				(value) => {
					// pressing the one already chosen would unset a single group; there is always a
					// language.
					if (!isLocale(value) || value === currentLocale) return;

					void onChange(value);
				}
			}
		>
			{#each locales as loc (loc)}
				<ToggleGroup.Item value={loc} class="flex-1" data-locale={loc}>
					{localesMetadata[loc].label}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	{/snippet}
</SettingsRow>
