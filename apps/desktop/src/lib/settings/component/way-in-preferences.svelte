<script lang="ts">
	import { resolve } from '$app/paths';
	import LanguageChoice from '$lib/design/block/language-choice.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import { toAppearanceSetting } from '$lib/platform/appearance';
	import SettingsAppearance from '$lib/settings/component/appearance.svelte';
	import { useFetchSettings, useSetLocale } from '$lib/settings/query';
	import { THE_SETTINGS_AREA } from '$lib/settings/section';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import LanguagesIcon from '@lucide/svelte/icons/languages';

	/**
	 * The one quiet control at the foot of every step of the way in (effort 843, requirement 7).
	 *
	 * **It names the language, and it opens what a machine can be set to before anybody is in**:
	 * the language, the appearance, and the way to all the settings. The rail used to reach those,
	 * and the way in has no rail, so they are here, under a control small enough not to compete with
	 * the step above it. The language is the one most likely to be wanted before anything else can
	 * be read, which is why the control is named for it, in its own words.
	 *
	 * **Both choices are the settings area's own, drawn unchanged**, so a language or an appearance
	 * chosen here is the same act as in settings: drawn at once, then written.
	 *
	 * **The wall hands in two more**, "use a link" and "disconnect this machine", which were the
	 * wall's way out of a jam before "can't sign in?" became a sentence (ticket 01's look). Every
	 * other step hands in none.
	 */
	let {
		extras = []
	}: {
		/** acts only the step drawing this has, below the choices. */
		extras?: { label: string; onSelect: () => void; destructive?: boolean }[];
	} = $props();

	let open = $state(false);

	const settingsQuery = useFetchSettings();
	const setLocale = useSetLocale();

	const stored = $derived(toAppearanceSetting(settingsQuery.data?.appearance));
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="text-muted-foreground"
				aria-label={$LL.settings.wayIn.preferences()}
				data-way-in-preferences
			>
				<LanguagesIcon />
				{localesMetadata[$locale].label}
			</Button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="flex w-80 flex-col gap-4 p-4" side="top">
		<LanguageChoice
			label={$LL.settings.localeTitle()}
			bind:value={
				() => $locale,
				(next) => {
					if (next !== $locale) setLocale.mutate({ locale: next });
				}
			}
		/>

		<SettingsAppearance {stored} />

		<Separator />

		<div class="flex flex-col gap-1">
			<Button
				variant="ghost"
				size="sm"
				class="justify-start"
				href={resolve(THE_SETTINGS_AREA)}
				onclick={() => (open = false)}
				data-way-in-all-settings
			>
				<span class="first-letter:uppercase">{$LL.settings.wayIn.allSettings()}</span>
			</Button>

			{#each extras as extra (extra.label)}
				<Button
					variant="ghost"
					size="sm"
					class="justify-start {extra.destructive ? 'text-destructive' : ''}"
					onclick={() => {
						open = false;
						extra.onSelect();
					}}
				>
					<span class="first-letter:uppercase">{extra.label}</span>
				</Button>
			{/each}
		</div>
	</Popover.Content>
</Popover.Root>
