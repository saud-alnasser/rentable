<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/design/primitive/card';
	import { Label } from '$lib/design/primitive/label';
	import * as Select from '$lib/design/primitive/select';
	import { cn } from '$lib/design/tailwind.js';
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

	const settingsInsetPanelClass = 'rounded-2xl border bg-muted p-4 text-start';
</script>

<Card>
	<CardHeader class="gap-3 border-b pb-5">
		<CardTitle>{$LL.settings.localeTitle()}</CardTitle>
		<CardDescription>{$LL.settings.localeDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="pt-5">
		<div class={cn(settingsInsetPanelClass, 'space-y-2')}>
			<Label for="app-locale">{$LL.settings.localeLabel()}</Label>
			<Select.Root
				type="single"
				value={currentLocale}
				onValueChange={async (value) => {
					if (!value) return;
					await onChange(value as Locales);
				}}
			>
				<Select.Trigger id="app-locale" class="w-full capitalize">
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
		</div>
	</CardContent>
</Card>
