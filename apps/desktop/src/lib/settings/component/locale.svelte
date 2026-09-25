<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { locales } from '$lib/i18n/i18n-util';

	/**
	 * The language, as one button per language that applies the moment it is pressed.
	 *
	 * Buttons and not a menu, as the appearance beside it is: two choices fit, and a reader
	 * choosing between them wants to see both ([[rules/interface]], *Field kinds*). Each language
	 * is named in its own words, so a reader who cannot read the current one still finds theirs.
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

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Label id="app-locale-label">
			<span class="first-letter:uppercase">{$LL.settings.localeTitle()}</span>
		</Field.Label>
		<Field.Description>{$LL.settings.localeDescription()}</Field.Description>
	</Field.Content>
	<ToggleGroup.Root
		type="single"
		variant="outline"
		id="app-locale"
		aria-labelledby="app-locale-label"
		class="w-full sm:w-56"
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
</Field.Field>
