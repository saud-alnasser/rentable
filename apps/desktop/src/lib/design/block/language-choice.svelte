<script lang="ts">
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { locales } from '$lib/i18n/i18n-util';

	/**
	 * The language something handed to a tenant is written in, which is not the application's own:
	 * a printed page, or a reminder. One button per language, each named in its own words, the way
	 * the application's language is chosen in settings; there is always one chosen.
	 */
	let {
		value = $bindable(),
		label,
		disabled = false
	}: { value: Locales; label: string; disabled?: boolean } = $props();

	const isLocale = (candidate: string): candidate is Locales =>
		(locales as readonly string[]).includes(candidate);
</script>

<ToggleGroup.Root
	type="single"
	{disabled}
	variant="outline"
	aria-label={label}
	class="w-full"
	data-language-choice
	bind:value={
		() => value,
		(chosen) => {
			// pressing the one already chosen would unset a single group; there is always a language.
			if (isLocale(chosen)) value = chosen;
		}
	}
>
	{#each locales as loc (loc)}
		<ToggleGroup.Item value={loc} class="flex-1" data-locale={loc}>
			{localesMetadata[loc].label}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
