<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import { sectionsOn } from '$lib/app/surfaces';
	import { tauri } from '$lib/platform/tauri';
	import Loading from '@rentable/design/block/loading.svelte';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import { toErrorText } from '$lib/error/message';
	import { showErrorToast } from '$lib/notification';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { addressAfterSignOut } from '$lib/shell/shell-surface';
	import { useStartup } from '$lib/shell/startup-context';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import SettingsArea from '$lib/settings/component/area.svelte';
	import { useFetchSettings } from '$lib/settings/query';
	import { sectionOf } from '$lib/settings/section';

	/**
	 * Everything a person sets, at one address.
	 *
	 * **The route owns the area's queries and the area owns none** ([[rules/frontend]]): the
	 * settings, and whether anybody is signed in, which decides the sections offered. That split
	 * is what lets requirement 14's gating be read signed in and signed out with no shell. The
	 * sections other features contribute are handed over from `app/surfaces` and read what they
	 * show for themselves (effort 840); what they cannot do is leave for the wall, so this hands
	 * them that. A member's and a workspace's acts are not here either: the organization host in
	 * the frame runs them (effort 832, requirement 8).
	 *
	 * **The section is `?section=` on this pathname, and the pathname is load-bearing.** This is
	 * the one address that draws with nobody signed in (`shell/shell-surface.ts`), matched
	 * exactly, and the back trail is keyed by pathname, so moving between sections is not leaving
	 * the page. `settings/section.ts` says why that beat a segment per section.
	 *
	 * **Signed out, general alone is offered and the organization's own reading is off.** The
	 * settings query is public and reaches no database, which is what qualified this address for
	 * the wall's list in the first place; the contributed sections are not drawn, so nothing of
	 * theirs is asked until there is a member.
	 */
	const startup = useStartup();
	const settingsQuery = useFetchSettings();
	const stateQuery = useFetchOrganizationState();
	const sections = sectionsOn('settings');

	const signedIn = $derived((stateQuery.data?.session ?? null) !== null);

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

	/**
	 * a contributed section let go of the organization: the disconnect and the delete each end
	 * here once the shell has forgotten it, and the startup unit reads where the machine stands
	 * and raises the first screen.
	 *
	 * The wall is drawn in place of the route, and this address opens signed out, so a machine
	 * left standing here after it let go of its organization would show the settings of nothing
	 * with no wall in front of them. The sign-out leaves the same way (`routes/+layout.svelte`).
	 */
	const leaveForTheWall = async () => {
		const destination = addressAfterSignOut(page.url.pathname);

		if (destination) {
			await goto(resolve(destination));
		}

		void startup.standingChanged();
	};
</script>

<Loading loading={isLoading} label={$LL.common.messages.loadingSettings()}>
	<!-- the shape of the area: the title, the rail of sections under it, and a section's fields. -->
	{#snippet skeleton()}
		<PageFrame>
			<Skeleton class="h-9 w-40" />
			<div class="flex gap-6 border-b pb-3">
				{#each { length: 4 }, index (index)}
					<Skeleton class="h-4 w-20" />
				{/each}
			</div>
			{#each { length: 3 }, index (index)}
				<div class="flex flex-col gap-2">
					<Skeleton class="h-4 w-32" />
					<Skeleton class="h-9 w-full max-w-md" />
				</div>
			{/each}
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
