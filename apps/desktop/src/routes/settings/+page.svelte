<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import { tauri } from '$lib/platform/tauri';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
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
	import { showMadeLink } from '$lib/organization/dialogs.svelte';
	import {
		useAcceptOwnership,
		useChangeAccess,
		useChangePassword,
		useChangeRole,
		useOfferOwnership,
		useWithdrawOffer,
		useDeleteOrganization,
		useDeleteWorkspace,
		useDisconnectOrganization,
		useEndMemberSessions,
		useEndOtherSessions,
		useFetchMemberStandings,
		useFetchMembers,
		useFetchOrganizationState,
		useLockOutCost,
		useMakeMemberLink,
		useRemoveMember,
		useRenameMember,
		useUnsetMemberPassword
	} from '$lib/organization/query';
	import SettingsArea from '$lib/settings/component/area.svelte';
	import { useFetchRemoteSyncState, useFetchSettings } from '$lib/settings/query';
	import { sectionOf } from '$lib/settings/section';

	/**
	 * Everything a person sets, at one address.
	 *
	 * **The route owns the queries and the area owns none** ([[rules/frontend]]). What is here is
	 * the four pages' worth of reading and writing that `/organization`, `/workspace`, `/account`
	 * and this page each did for themselves, plus the one confirm that has to read a cost before
	 * it can ask its question; `settings/component/area.svelte` is handed the answers and draws.
	 * That split is what lets requirement 14's gating be read with two sessions and no shell.
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
	const makeMemberLink = useMakeMemberLink();
	const unsetMemberPassword = useUnsetMemberPassword();
	const removeMember = useRemoveMember();
	const renameMember = useRenameMember();
	const changeRole = useChangeRole();
	const offerOwnership = useOfferOwnership();
	const withdrawOffer = useWithdrawOffer();
	const acceptOwnership = useAcceptOwnership();
	const changeAccess = useChangeAccess();
	const deleteWorkspace = useDeleteWorkspace();
	const deleteOrganization = useDeleteOrganization();
	const disconnectOrganization = useDisconnectOrganization();
	const endOtherSessions = useEndOtherSessions();
	const endMemberSessions = useEndMemberSessions();

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
	 * the removal being asked about: which member, and at which speed. The lock-out's dialog
	 * waits for the cost to be read, because the number it states is the number the act uses.
	 */
	let removing = $state<{ memberId: string; lockOut: boolean } | null>(null);

	const lockOutCost = useLockOutCost(() => (removing?.lockOut ? removing.memberId : null));

	const removingName = $derived.by(() => {
		if (!removing) return '';

		const member = (membersQuery.data ?? []).find(
			(candidate) => candidate.id === removing?.memberId
		);

		return member ? member.username : removing.memberId;
	});

	const lockOutDescription = $derived.by(() => {
		const cost = lockOutCost.data;

		if (!removing?.lockOut || !cost) return $LL.organization.dashboard.lockOutReading();

		return $LL.organization.dashboard.lockOutDescription({
			count: cost.membersAffected,
			workspaces:
				cost.workspaces.map((workspace) => workspace.name).join(', ') ||
				$LL.organization.dashboard.noWorkspaces()
		});
	});

	const confirmRemoval = async () => {
		if (!removing) return;

		const { memberId, lockOut } = removing;

		// what the removal did is announced by the hook, which is the only place a toast is
		// raised ([[rules/frontend]], *Data access*); this reads the session again because a
		// lock-out rotates workspaces the reader may hold.
		await removeMember.mutateAsync({ memberId, lockOut });
		await stateQuery.refetch();
	};

	let makingLink = $state<string | null>(null);
	let unsetting = $state<string | null>(null);
	let endingSessions = $state<string | null>(null);

	/**
	 * sign a member out of every machine, from their row.
	 *
	 * It runs on the press, as the reset beside it does: the row's actions act, and the one
	 * question this effort asks before ending sessions is the reader's own, in the you section,
	 * where what is at stake is the machines they are not standing at.
	 */
	const endSessions = async (memberId: string) => {
		endingSessions = memberId;

		try {
			await endMemberSessions.mutateAsync({ memberId });
		} catch {
			// said by the shared handler.
		} finally {
			endingSessions = null;
		}
	};

	/**
	 * the one link that admits a machine to an account (effort 828, requirement 20).
	 *
	 * **The reader chooses nothing but the account.** Whether the link asks for a password or lands
	 * its machine at the wall is read off the account's own standing in the shell, and a machine
	 * already signed in on it is what the shell refuses this with. What comes back is shown once,
	 * on the one panel that shows a link and a code.
	 */
	const makeLink = async (memberId: string) => {
		makingLink = memberId;

		try {
			showMadeLink(await makeMemberLink.mutateAsync({ memberId }));
		} catch {
			// said by the shared handler.
		} finally {
			makingLink = null;
		}
	};

	/**
	 * the reset: the account's password unset, so the next link made for it asks for a new one.
	 *
	 * It hands over nothing, which is the whole of what changed: what it could not carry over is
	 * announced by the hook, the one place a toast is raised ([[rules/frontend]], *Data access*),
	 * and the link is a second press on the same card.
	 */
	const unsetPassword = async (memberId: string) => {
		unsetting = memberId;

		try {
			await unsetMemberPassword.mutateAsync({ memberId });
		} catch {
			// said by the shared handler.
		} finally {
			unsetting = null;
		}
	};

	/**
	 * a member's workspaces: the dialog hands back the rows that changed, and a row that changed
	 * to `none` is the grant coming back. The writes and the one announcement are the mutation's,
	 * so this is the shape of the answer turned into the shape the mutation takes.
	 */
	const changeMemberAccess = (
		memberId: string,
		changes: { id: string; access: 'none' | 'full-access' | 'read-only' }[]
	) =>
		changeAccess.mutateAsync({
			changes: changes.map((change) => ({
				workspaceId: change.id,
				memberId,
				access: change.access
			}))
		});

	/**
	 * the same writes, asked the other way round: one workspace, and the members whose access on
	 * it changed. The workspaces section asks *who holds this*, the members section asks *what
	 * does this person hold*, and both end in the same mutation.
	 */
	const changeWorkspaceAccess = (
		workspaceId: string,
		changes: { memberId: string; access: 'none' | 'full-access' | 'read-only' }[]
	) =>
		changeAccess.mutateAsync({
			changes: changes.map((change) => ({
				workspaceId,
				memberId: change.memberId,
				access: change.access
			}))
		});

	/**
	 * a workspace deleted, once the confirm in the section has asked: the database goes with it,
	 * so the session is read again to drop the row the rail's switcher is still drawing.
	 */
	const removeWorkspace = async (workspaceId: string) => {
		await deleteWorkspace.mutateAsync({ workspaceId });
		await stateQuery.refetch();
	};

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
	 * the organization, offered once the surface has taken the owner's password (effort 828,
	 * requirement 22).
	 *
	 * The state is not read again: nothing about this reader changed, because an offer moves
	 * nothing until the other person accepts it on a machine of their own. What changed is on the
	 * members list, which the hook refreshes. A refusal is said by the shared handler and
	 * rethrown, so the surface stays open and marks the password.
	 */
	const offer = async (memberId: string, password: string) => {
		await offerOwnership.mutateAsync({ memberId, password });
	};

	/** the offer taken back, from the same card. It asks nothing and announces itself. */
	const withdraw = async () => {
		try {
			await withdrawOffer.mutateAsync();
		} catch {
			// said by the shared handler.
		}
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
			{makingLink}
			{unsetting}
			{endingSessions}
			isChangingPassword={changePassword.isPending}
			isChangingRole={changeRole.isPending}
			isChangingAccess={changeAccess.isPending}
			isOffering={offerOwnership.isPending}
			isWithdrawing={withdrawOffer.isPending}
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
			onEndSessions={(memberId) => void endSessions(memberId)}
			onMakeLink={(memberId) => void makeLink(memberId)}
			onUnsetPassword={(memberId) => void unsetPassword(memberId)}
			onRemove={(memberId) => {
				removing = { memberId, lockOut: false };
			}}
			onLockOut={(memberId) => {
				removing = { memberId, lockOut: true };
			}}
			onRename={async (memberId, username) => {
				await renameMember.mutateAsync({ memberId, username });
			}}
			onChangeRole={async (memberId, role, permissions) => {
				await changeRole.mutateAsync({ memberId, role, permissions });
			}}
			onChangeAccess={changeMemberAccess}
			onOfferOwnership={offer}
			onWithdrawOffer={() => void withdraw()}
			onAcceptOwnership={accept}
			onChangeWorkspaceAccess={changeWorkspaceAccess}
			onDeleteWorkspace={removeWorkspace}
			onAuthorityReconnected={() => void stateQuery.refetch()}
			onDeleteOrganization={removeOrganization}
			onDisconnect={disconnect}
		/>

		<!-- the ordinary removal asks once and says what it does not do: nothing on the member's
		     machine is taken back. The lock-out asks with the cost read first, and names how many
		     others stop syncing, because turso revokes per database and totally.

		     It sits here rather than in the area because it reads a query of its own, and the area
		     reads none; the members section raises it through `onRemove` and `onLockOut`. -->
		<DeleteDialog
			open={removing !== null}
			onOpenChange={(open) => {
				if (!open) removing = null;
			}}
			onSubmit={confirmRemoval}
			record={removingName}
			title={removing?.lockOut
				? $LL.organization.dashboard.removeAndLockOut()
				: $LL.organization.dashboard.remove()}
			description={removing?.lockOut
				? lockOutDescription
				: $LL.organization.dashboard.removeDescription()}
			confirmLabel={removing?.lockOut
				? $LL.organization.dashboard.removeAndLockOut()
				: $LL.organization.dashboard.remove()}
			confirmLoadingLabel={$LL.common.actions.working()}
			blockers={removing?.lockOut && !lockOutCost.data ? AWAITING_BLOCKERS : undefined}
		/>
	{/if}
</Loading>
