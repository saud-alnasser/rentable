<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { locales } from '$lib/i18n/i18n-util';

	let {
		currentLocale,
		onChange
	}: {
		currentLocale: Locales;
		onChange: (locale: Locales) => Promise<void> | void;
	} = $props();
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Label for="app-locale">{$LL.settings.localeTitle()}</Field.Label>
		<Field.Description>{$LL.settings.localeDescription()}</Field.Description>
	</Field.Content>
	<Select.Root
		type="single"
		value={currentLocale}
		onValueChange={async (value) => {
			if (!value) return;
			await onChange(value as Locales);
		}}
	>
		<Select.Trigger id="app-locale" class="w-full capitalize sm:w-56">
			{localesMetadata[currentLocale].label}
		</Select.Trigger>
		<Select.Content>
			{#each locales as loc (loc)}
				<Select.Item value={loc} label={localesMetadata[loc].label} class="capitalize">
					{localesMetadata[loc].label}
				</Select.Item>
			{/each}
		</Select.Content>
	</Select.Root>
</Field.Field>
