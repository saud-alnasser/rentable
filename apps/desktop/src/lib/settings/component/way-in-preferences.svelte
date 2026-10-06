<script lang="ts">
	import LanguageChoice from '$lib/design/block/language-choice.svelte';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import { toAppearanceSetting } from '$lib/platform/appearance';
	import SettingsAppearance from '$lib/settings/component/appearance.svelte';
	import { useFetchSettings, useSetLocale } from '$lib/settings/query';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
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
	 * **It carries those two and nothing else, on every step** (effort 851, requirement 15). The
	 * wall handed in two more, "use a link" and "disconnect this machine", as its way out of a jam,
	 * and nobody could tell they were inside a control named for a language. The organization
	 * switcher above the wall's fields carries both now, in sight, as "add organization" and its x,
	 * so the `extras` this took went with them.
	 *
	 * **Only the language and the appearance, and no way to all the settings** (at the human's word
	 * on 2026-10-01). The settings a machine has before anybody is in are those two; everything else
	 * on the settings page is about a workspace, and reached from the rail once somebody is. The
	 * appearance is its three buttons with nothing above them. *It carried a link to all settings
	 * from ticket 04 until the human's walk.*
	 */
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

		<SettingsAppearance {stored} bare />
	</Popover.Content>
</Popover.Root>
