<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import { tauri } from '$lib/platform/tauri';
	import Loading from '@rentable/design/block/loading.svelte';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import { toErrorText } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { addressAfterSignOut } from '$lib/layout/shell-surface';
	import { useStartup } from '$lib/layout/startup-context';
	import {
		useAcceptOwnership,
		useChangePassword,
		useDeleteOrganization,
		useDisconnectOrganization,
		useEndOtherSessions,
		useFetchMemberStandings,
		useFetchMembers,
		useFetchOrganizationState
	} from '$lib/organization/query';
	import SettingsArea from '$lib/settings/component/area.svelte';
	import { useFetchRemoteSyncState, useFetchSettings } from '$lib/settings/query';
	import { sectionOf } from '$lib/settings/section';

	/**
	 * Everything a person sets, at one address.
	 *
	 * **The route owns the queries and the area owns none** ([[rules/frontend]]). What is here is
	 * the four pages' worth of reading and writing that `/organization`, `/workspace`, `/account`
	 * and this page each did for themselves; `settings/component/area.svelte` is handed the answers
	 * and draws. That split is what lets requirement 14's gating be read with two sessions and no
	 * shell. A member's and a workspace's acts are not here: the organization host in the frame
	 * runs them, and the confirm that reads a lock-out's cost is its (effort 832, requirement 8).
	 *
	 * **The section is `?section=` on this pathname, and the pathname is load-bearing.** This is
	 * the one address that draws with nobody signed in (`layout/shell-surface.ts`), matched
	 * exactly, and the back trail is keyed by pathname, so moving between sections is not leaving
	 * the page. `settings/section.ts` says why that beat a segment per section.
	 *
	 * **Signed out, three sections are offered and the organization's own reading is off.** The
	 * settings query is public and reaches no database, which is what qualified this address for
	 * the wall's list in the first place; the members list is a member's procedure and asks
	 * nothing until there is a member.
	 */
	const startup = useStartup();
	const settingsQuery = useFetchSettings();
	const stateQuery = useFetchOrganizationState();
	const membersQuery = useFetchMembers();
	// where each account stands, asked beside the list and joined to it on the member's id: the
	// password is on the signed member row and the machine is on the register (effort 828,
	// requirement 19).
	const standingsQuery = useFetchMemberStandings();

	const session = $derived(stateQuery.data?.session ?? null);

	const remoteSyncQuery = useFetchRemoteSyncState(() => session !== null);

	const changePassword = useChangePassword();
	const acceptOwnership = useAcceptOwnership();
	const deleteOrganization = useDeleteOrganization();
	const disconnectOrganization = useDisconnectOrganization();
	const endOtherSessions = useEndOtherSessions();

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
			await api.app.settings.set({ locale: next });
			await settingsQuery.refetch();
		} catch (error) {
			setLocale(previousLocale);
			showErrorToast(error, $LL);
		}
	}

	/**
	 * the disconnect, once confirmed: the shell forgets the organization, and the startup unit
	 * reads where the machine stands and raises the first screen. A refusal is said by the shared
	 * handler and rethrown so the confirm stays open on it.
	 */
	const disconnect = async () => {
		await disconnectOrganization.mutateAsync();
		await leaveForTheWall();
	};

	/**
	 * the wall is drawn in place of the route, and this address opens signed out, so a machine
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

	/**
	 * the organization, accepted once the surface has taken this reader's password.
	 *
	 * The state is read again after it, because the reader's own role changed: they are the owner
	 * now, and the sections the area offers, the acts the cards carry and the rail's menus are all
	 * drawn off that. A refusal is said by the shared handler and rethrown, so the surface stays
	 * open and marks the password.
	 */
	const accept = async (password: string) => {
		await acceptOwnership.mutateAsync({ password });
		await stateQuery.refetch();
	};

	/**
	 * the organization, deleted once the surface has taken the owner's password: the shell removes
	 * every workspace database and the directory from the Turso account and forgets all of it
	 * here, and the startup unit raises the first screen, exactly as a disconnect leaves it. A
	 * refusal is said by the shared handler and rethrown, so the surface stays open and marks the
	 * password.
	 */
	const removeOrganization = async (password: string) => {
		await deleteOrganization.mutateAsync({ password });
		await leaveForTheWall();
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
			{session}
			holdsTursoAuthority={stateQuery.data?.holdsTursoAuthority === true}
			syncState={remoteSyncQuery.data ?? null}
			members={membersQuery.data ?? []}
			standings={standingsQuery.data ?? []}
			isChangingPassword={changePassword.isPending}
			isAcceptingOwnership={acceptOwnership.isPending}
			isDeletingOrganization={deleteOrganization.isPending}
			onChangeLocale={(next) => void changeLocale(next)}
			onRevealDiagnostics={() => void revealDiagnostics()}
			onChangePassword={async (current, next) => {
				await changePassword.mutateAsync({ current, next });
			}}
			onEndOtherSessions={async () => {
				await endOtherSessions.mutateAsync();
			}}
			onAcceptOwnership={accept}
			onAuthorityReconnected={() => void stateQuery.refetch()}
			onDeleteOrganization={removeOrganization}
			onDisconnect={disconnect}
		/>
	{/if}
</Loading>
