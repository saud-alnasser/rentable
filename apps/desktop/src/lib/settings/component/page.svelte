<script lang="ts">
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import type { Section } from '$lib/feature/surface';
	import { tauri } from '$lib/platform/tauri';
	import BackControl from '@rentable/design/block/back-control.svelte';
	import Loading from '@rentable/design/block/loading.svelte';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import { toErrorText } from '$lib/error/message';
	import { showErrorToast } from '$lib/notification';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import SettingsArea from '$lib/settings/component/area.svelte';
	import { useFetchSettings } from '$lib/settings/query';
	import { sectionOf } from '$lib/settings/section';
	import { untrack } from 'svelte';

	/**
	 * Everything a person sets, at one address.
	 *
	 * **This page owns the area's queries and the area owns none** ([[rules/frontend]]): the
	 * settings, read here, and whether anybody is signed in, which decides the sections offered and
	 * is handed over. That split is what lets requirement 14's gating be read signed in and signed
	 * out with no shell. The sections other features contribute are handed over from `app/surfaces`
	 * and read what they show for themselves (effort 840); what they cannot do is leave for the
	 * wall, so this hands them that. A member's and a workspace's acts are not here either: the
	 * organization host in the frame runs them (effort 832, requirement 8).
	 *
	 * **What the contributed sections read starts here, as the page mounts, beside the settings
	 * query.** Each one's `load` runs in this setup rather than the area's: the area is drawn only
	 * once the settings have arrived, so started there the organization's reads waited on the
	 * settings and never ran where the settings failed to load. The route started all of them
	 * together as it mounted until effort 840, and this keeps that moment.
	 *
	 * **Whether anybody is signed in and the way to the wall are the route's to hand over**, from
	 * `$lib/organization/ui` and `$lib/startup/ui`: the one is the organization's and the other
	 * startup's, and settings reaches neither. *This was the route itself until effort 840's ticket 34.*
	 * The way in's address is handed over too, for the same reason: it is startup's.
	 *
	 * **Signed out, this draws back in the corner of the way-in frame, and it returns to the way
	 * in.** That frame has no rail to leave the settings by, so back sits where it sits on each step
	 * of the way in (effort 843, requirement 7). *The route drew it until effort 843's ticket 16.*
	 *
	 * **The section is `?section=` on this pathname, and the pathname is load-bearing.** This is
	 * the one address that draws with nobody signed in (`startup/screen.ts`), matched
	 * exactly, and the back trail is keyed by pathname, so moving between sections is not leaving
	 * the page. `settings/section.ts` says why that beat a segment per section.
	 *
	 * **Signed out, general alone is offered and the organization's own reading is off.** The
	 * settings query is public and reaches no database, which is what qualified this address for
	 * the wall's list in the first place; the contributed sections are not drawn, so nothing of
	 * theirs is asked until there is a member.
	 */
	let {
		signedIn,
		sections,
		leaveForTheWall,
		wayIn
	}: {
		/** whether anybody is signed in on this machine. */
		signedIn: boolean;
		/** what other features contribute to the settings, handed over by the route. */
		sections: Section<'settings'>[];
		/**
		 * a contributed section let go of the organization, and the machine leaves for the wall.
		 */
		leaveForTheWall: () => Promise<void>;
		/** the way in's address, where back goes signed out. */
		wayIn: string;
	} = $props();

	const settingsQuery = useFetchSettings();

	// every contribution starts what it reads now, whatever the settings query goes on to do, so
	// switching to a section draws its data rather than a load. The list is the route's constant, so
	// the first value is the one there is.
	for (const entry of untrack(() => sections)) {
		entry.load?.();
	}

	const isLoading = $derived(settingsQuery.isLoading && !settingsQuery.data);
	const loadError = $derived(
		settingsQuery.error && !settingsQuery.data ? settingsQuery.error : undefined
	);

	const section = $derived(sectionOf(page.url));

	async function revealDiagnostics() {
		const diagnosticsDir = settingsQuery.data?.diagnosticsDir;

		if (!diagnosticsDir) {
			return;
		}

		try {
			await tauri.opener.revealItemInDir(diagnosticsDir);
		} catch (error) {
			showErrorToast(error, $LL);
		}
	}

	async function changeLocale(next: Locales) {
		if (next === $locale) {
			return;
		}

		const previousLocale = $locale;
		setLocale(next);

		try {
			await api.settings.set({ locale: next });
			await settingsQuery.refetch();
		} catch (error) {
			setLocale(previousLocale);
			showErrorToast(error, $LL);
		}
	}
</script>

{#if !signedIn}
	<div class="absolute start-4 top-4 z-10">
		<BackControl fallback={wayIn} />
	</div>
{/if}

<Loading loading={isLoading} label={$LL.common.messages.loadingSettings()}>
	<!-- the shape of the area: the title, the rail of sections under it, and a section's groups of
	     rows, each a short title over a card of rows with a glyph, a name and a control. -->
	{#snippet skeleton()}
		<PageFrame>
			<Skeleton class="h-9 w-40" />
			<div class="flex gap-6 border-b pb-3">
				{#each { length: 4 }, index (index)}
					<Skeleton class="h-4 w-20" />
				{/each}
			</div>
			<div class="flex flex-col gap-8">
				{#each [2, 2, 1] as rows, group (group)}
					<div data-skeleton-group class="flex flex-col gap-2">
						<Skeleton class="mx-3 h-4 w-24" />
						<div class="flex flex-col rounded-2xl border bg-card">
							{#each { length: rows }, row (row)}
								<div data-skeleton-row class="flex items-center gap-3 px-3 py-2.5">
									<Skeleton class="size-4 rounded-sm" />
									<Skeleton class="h-4 w-28" />
									<Skeleton class="ms-auto h-8 w-40" />
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</PageFrame>
	{/snippet}

	{#if loadError}
		<!-- no description between the title and the failure: the title says the settings are not
		     available and the line below says why, so a sentence in between only says it a third
		     time in weaker words. -->
		<!-- neutral: settings failing to load leaves the rest of the application working. -->
		<StandaloneSurface tone="neutral" title={$LL.settings.loadErrorTitle()}>
			<p class="text-sm text-muted-foreground">{toErrorText(loadError, $LL)}</p>

			{#snippet actions()}
				<Button onclick={() => void settingsQuery.refetch()}>
					{$LL.common.actions.retry()}
				</Button>
			{/snippet}
		</StandaloneSurface>
	{:else if settingsQuery.data}
		<SettingsArea
			{section}
			settings={settingsQuery.data}
			{signedIn}
			{sections}
			onChangeLocale={(next) => void changeLocale(next)}
			onRevealDiagnostics={() => void revealDiagnostics()}
			{leaveForTheWall}
		/>
	{/if}
</Loading>
