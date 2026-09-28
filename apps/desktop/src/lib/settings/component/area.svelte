<script lang="ts">
	import { resolve } from '$app/paths';
	import type api from '$lib/api/caller';
	import type { Section } from '$lib/feature/surface';
	import type { Locales } from '$lib/i18n/i18n-types';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import SectionSwitch from '@rentable/design/block/section-switch.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import SettingsAppearance from '$lib/settings/component/appearance.svelte';
	import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
	import SettingsEndingSoon from '$lib/settings/component/ending-soon.svelte';
	import SettingsLocale from '$lib/settings/component/locale.svelte';
	import SettingsUpdates from '$lib/settings/component/updates.svelte';
	import {
		holdingSection,
		sectionsFor,
		shownSection,
		withSection,
		type AddressableSection
	} from '$lib/settings/section';
	import { untrack } from 'svelte';

	type AppSettings = Awaited<ReturnType<typeof api.settings.get>>;

	/**
	 * The settings area: one surface, a rail of sections, and the chosen section's blocks.
	 *
	 * **It replaced four pages**, `/settings`, `/organization`, `/workspace` and `/account`,
	 * which had grown apart because each was reached from a different control, and not one of
	 * them was about a different subject than what this copy of the application is set to. The
	 * four headings a reader had to know became sections of one page (requirement 14 of effort
	 * 826), and the two menus in the rail open a section rather than a page.
	 *
	 * **Four sections, each named for what it holds** (requirement 24 of effort 828). There were
	 * seven, and a person looking for one thing had to guess which of them it was under. General
	 * carries the general blocks, then updates and diagnostics under their own legends; account
	 * carries what a person reads about themselves; organization carries where this machine stands
	 * with it on Turso, the Turso account, the members directory and the two acts that end
	 * something; workspaces carries the directory and the transfer beneath it. Nothing moved
	 * between sections beyond that list.
	 *
	 * **General is the area's own, and the other three are contributed** (effort 840,
	 * requirements 4 and 5). The organization declares them in its `surface.ts` with
	 * `on: 'settings'`, and the route hands them here from `app/surfaces`, so this names no
	 * feature: it draws the rail from general and what it is handed, in their order and under
	 * their labels, and draws the chosen one's component. Each reads what it shows for itself,
	 * and starts reading it here, through its `load`, as the area opens.
	 *
	 * **It owns no query**, which is what makes requirement 14's gating readable without a shell:
	 * the route reads the settings and whether anybody is signed in, and this is handed the
	 * answers and a callback per act of its own. So its test renders it signed in and signed out
	 * and reads the rail, which no test of a route could do.
	 *
	 * **A section with nothing to show is absent**: `sectionsFor` decides which tabs exist, and
	 * inside a section the reader's permissions decide each block. Rust refuses every one of them
	 * again.
	 */
	let {
		section,
		settings,
		signedIn,
		sections,
		onChangeLocale,
		onRevealDiagnostics,
		leaveForTheWall
	}: {
		/**
		 * the section the address named. One this reader is not offered draws the default, and a
		 * name a section used to go by draws the section that holds what it held.
		 */
		section: AddressableSection;
		settings: AppSettings;
		/** whether anybody is signed in; `false` on the way in, where the area draws general alone. */
		signedIn: boolean;
		/** the sections contributed to the area, in their order: `sectionsOn('settings')`. */
		sections: Section<'settings'>[];
		onChangeLocale: (next: Locales) => void;
		onRevealDiagnostics: () => void;
		/**
		 * this machine let go of its organization: leave for wherever signing out leaves. Handed to
		 * each contributed section, since the act that lets go is one of theirs.
		 */
		leaveForTheWall: () => Promise<void>;
	} = $props();

	// every contribution starts what it reads as the area opens, whichever section is shown, so
	// switching to one draws its data rather than a load. The list is the route's constant, so the
	// first value is the one there is.
	for (const entry of untrack(() => sections)) {
		entry.load?.();
	}

	// what is contributed and this reader may see, in its order; one the reader may not see is
	// left out whole.
	const contributed = $derived(sections.filter((entry) => entry.shows?.() ?? true));
	const offered = $derived(
		sectionsFor(
			signedIn,
			contributed.map((entry) => entry.value)
		)
	);
	const shown = $derived(shownSection(holdingSection(section), offered));
	const contribution = $derived(contributed.find((entry) => entry.value === shown));

	// every section is addressable, so the switch is a row of links to the addresses a menu row,
	// the command palette and a bookmark open too. The mark follows `shown`, so an address naming
	// a section this reader is not offered marks the section that is drawn.
	const switchable = $derived(
		offered.map((value) => ({
			value,
			label:
				contributed.find((entry) => entry.value === value)?.label($LL) ??
				$LL.settings.section[value](),
			href: resolve(withSection(value))
		}))
	);
</script>

<PageFrame>
	<!-- the title alone, as the settings page has carried it: the rail below names the sections,
	     so a sentence here would list what the tabs already list. -->
	<h1 class="text-3xl font-semibold first-letter:uppercase">{$LL.settings.title()}</h1>

	<SectionSwitch sections={switchable} current={shown} label={$LL.settings.title()} />

	{#if shown === 'general'}
		<Field.Group>
			<!-- what the section is named for goes first and takes no legend of its own: the rail
			     above already says general, and a legend repeating it is the tab said twice. The two
			     below carry one each, because they are things of their own under that name. -->
			<Field.Set data-general>
				<SettingsLocale currentLocale={$locale} onChange={onChangeLocale} />
				<Field.Separator />
				<SettingsAppearance stored={settings.appearance} />
				<Field.Separator />
				<SettingsEndingSoon {settings} />
			</Field.Set>

			<Separator />

			<Field.Set data-updates>
				<Field.Legend>{$LL.settings.updatesTitle()}</Field.Legend>
				<SettingsUpdates version={settings.version} />
			</Field.Set>

			<Separator />

			<Field.Set data-diagnostics>
				<Field.Legend>{$LL.settings.diagnosticsTitle()}</Field.Legend>
				<SettingsDiagnostics diagnosticsDir={settings.diagnosticsDir} {onRevealDiagnostics} />
			</Field.Set>
		</Field.Group>
	{:else if contribution}
		<contribution.component {leaveForTheWall} />
	{/if}
</PageFrame>
