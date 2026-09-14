<script lang="ts">
	import { page } from '$app/state';
	import api from '$lib/api/caller';
	import { tauri } from '$lib/platform/tauri';
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { AWAITING_BLOCKERS } from '@rentable/design/confirmation.js';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Spinner } from '@rentable/design/primitive/spinner/index.js';
	import { toErrorText } from '$lib/error/message';
	import { showErrorToast } from '$lib/error/toast';
	import { LL, locale, setLocale } from '$lib/i18n/i18n-svelte';
	import type { Locales } from '$lib/i18n/i18n-types';
	import { useStartup } from '$lib/layout/startup-context';
	import { showInvited } from '$lib/organization/dialogs.svelte';
	import {
		useChangePassword,
		useDisconnectOrganization,
		useFetchInvitations,
		useFetchMembers,
		useFetchOrganizationState,
		useLockOutCost,
		useReissueInvitation,
		useRemoveMember,
		useRenameMember,
		useRevokeInvitation
	} from '$lib/organization/query';
	import SettingsArea from '$lib/settings/component/area.svelte';
	import { useFetchRemoteSyncState, useFetchSettings } from '$lib/settings/query';
	import { sectionOf } from '$lib/settings/section';
	import { permits } from '@rentable/workspace-permission';
	import { toast } from 'svelte-sonner';

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
	 * the wall's list in the first place; the invitation list is a member's procedure and asks
	 * nothing until there is a member.
	 */
	const startup = useStartup();
	const settingsQuery = useFetchSettings();
	const stateQuery = useFetchOrganizationState();
	const membersQuery = useFetchMembers();

	const session = $derived(stateQuery.data?.session ?? null);
	const canInvite = $derived(permits(session?.permissions ?? 0, 'inviteMember'));

	const invitationsQuery = useFetchInvitations(() => canInvite);
	const remoteSyncQuery = useFetchRemoteSyncState(() => session !== null);

	const changePassword = useChangePassword();
	const reissueInvitation = useReissueInvitation();
	const revokeInvitation = useRevokeInvitation();
	const removeMember = useRemoveMember();
	const renameMember = useRenameMember();
	const disconnectOrganization = useDisconnectOrganization();

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
			toast.error(toErrorText(error, $LL));
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
		const removed = await removeMember.mutateAsync({ memberId, lockOut });

		toast.success(
			removed.lockedOut
				? $LL.organization.dashboard.lockedOut({ count: removed.othersMustReconnect })
				: $LL.organization.dashboard.removed()
		);
		await stateQuery.refetch();
	};

	let reissuing = $state<string | null>(null);
	let revoking = $state<string | null>(null);

	const reissue = async (memberId: string) => {
		reissuing = memberId;

		try {
			showInvited(await reissueInvitation.mutateAsync({ memberId }));
		} catch {
			// said by the shared handler.
		} finally {
			reissuing = null;
		}
	};

	const revoke = async (invitationId: string) => {
		revoking = invitationId;

		try {
			await revokeInvitation.mutateAsync({ invitationId });
		} catch {
			// said by the shared handler.
		} finally {
			revoking = null;
		}
	};

	/**
	 * the disconnect, once confirmed: the shell forgets the organization, and the startup unit
	 * reads where the machine stands and raises the first screen. A refusal is said by the shared
	 * handler and rethrown so the confirm stays open on it.
	 */
	const disconnect = async () => {
		await disconnectOrganization.mutateAsync();
		void startup.standingChanged();
	};
</script>

{#if isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-1">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingSettings()}</p>
		</div>
	</div>
{:else if loadError}
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
		invitations={invitationsQuery.data ?? []}
		{reissuing}
		{revoking}
		isChangingPassword={changePassword.isPending}
		onChangeLocale={(next) => void changeLocale(next)}
		onRevealDiagnostics={() => void revealDiagnostics()}
		onChangePassword={async (current, next) => {
			await changePassword.mutateAsync({ current, next });
		}}
		onReissue={(memberId) => void reissue(memberId)}
		onRevoke={(invitationId) => void revoke(invitationId)}
		onRemove={(memberId) => {
			removing = { memberId, lockOut: false };
		}}
		onLockOut={(memberId) => {
			removing = { memberId, lockOut: true };
		}}
		onRename={async (memberId, username) => {
			await renameMember.mutateAsync({ memberId, username });
		}}
		onAuthorityReconnected={() => void stateQuery.refetch()}
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
