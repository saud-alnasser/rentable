<script lang="ts">
	import type api from '$lib/api/caller';
	import type {
		OrganizationMember,
		OrganizationSession,
		RemoteSyncState
	} from '$lib/platform/host';
	import type { Locales } from '$lib/i18n/i18n-types';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import OrganizationChangePasswordForm from '$lib/organization/component/change-password-form.svelte';
	import OrganizationDisconnect from '$lib/organization/component/disconnect.svelte';
	import OrganizationEndOtherSessions from '$lib/organization/component/end-other-sessions.svelte';
	import OrganizationForgetAccount from '$lib/organization/component/forget-account.svelte';
	import OrganizationIdentity from '$lib/organization/component/identity.svelte';
	import OrganizationLink from '$lib/organization/component/organization-link.svelte';
	import OrganizationMembers from '$lib/organization/component/members.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/component/reconnect-authority.svelte';
	import OrganizationWorkspaces from '$lib/organization/component/workspaces.svelte';
	import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
	import SettingsEndingSoon from '$lib/settings/component/ending-soon.svelte';
	import SettingsLocale from '$lib/settings/component/locale.svelte';
	import SettingsRail from '$lib/settings/component/rail.svelte';
	import SettingsUpdates from '$lib/settings/component/updates.svelte';
	import { sectionsFor, shownSection, type SettingsSection } from '$lib/settings/section';
	import WorkspaceSync from '$lib/workspace/component/sync.svelte';
	import { permits } from '@rentable/workspace-permission';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	/**
	 * The settings area: one surface, a rail of sections, and the chosen section's blocks.
	 *
	 * **It replaced four pages**, `/settings`, `/organization`, `/workspace` and `/account`,
	 * which had grown apart because each was reached from a different control, and not one of
	 * them was about a different subject than what this copy of the application is set to. The
	 * four headings a reader had to know became seven sections of one page (requirement 14 of
	 * effort 826), and the two menus in the rail open a section rather than a page.
	 *
	 * **It owns no query**, which is what makes requirement 14's gating readable without a shell:
	 * the route reads the four queries the four pages read, and this is handed their answers and
	 * a callback per act. So its test renders it with one session and then another and reads the
	 * rail, which no test of a route could do.
	 *
	 * **What a section shows is the session's, and a section with nothing to show is absent**:
	 * `sectionsFor` decides which tabs exist, and inside a section the same permissions decide
	 * each block. Rust refuses every one of them again.
	 *
	 * **Each of the four organization sections is one component, and this composes rather than
	 * draws.** The members list, the workspaces list and the sync blocks each own their rows,
	 * their dialogs and their gates; what is here is which of them a reader is offered and what
	 * they are handed. *The workspaces and sync sections were the retired pages' components
	 * stood side by side until ticket 11 rebuilt them.*
	 */
	let {
		section,
		settings,
		session,
		holdsTursoAuthority,
		syncState,
		members,
		reissuing,
		revoking,
		copying,
		endingSessions,
		codeFor,
		isChangingPassword,
		isChangingRole,
		isChangingAccess,
		onChangeLocale,
		onRevealDiagnostics,
		onChangePassword,
		onEndOtherSessions,
		onEndSessions,
		onReissue,
		onRevoke,
		onCopyLink,
		onFreshCode,
		onRemove,
		onLockOut,
		onRename,
		onChangeRole,
		onChangeAccess,
		onChangeWorkspaceAccess,
		onDeleteWorkspace,
		onAuthorityReconnected,
		onDisconnect
	}: {
		/** the section the address named. One this reader is not offered draws the default. */
		section: SettingsSection;
		settings: AppSettings;
		/** who is reading, or `null` on the way in, where the area still draws three sections. */
		session: OrganizationSession | null;
		/** whether this machine holds the Turso authority: the owner's, after a consent. */
		holdsTursoAuthority: boolean;
		/** the machine's sync record; `null` until it has been read, and while signed out. */
		syncState: RemoteSyncState | null;
		members: OrganizationMember[];
		/** the member whose link is being reissued, while it is. */
		reissuing: string | null;
		/** the invitation being revoked, while it is. */
		revoking: string | null;
		/** the invitation whose link is being read again, while it is. */
		copying: string | null;
		/** the member whose sessions are being ended, while they are. */
		endingSessions: string | null;
		/** the invitation being given a fresh code, while it is. */
		codeFor: string | null;
		isChangingPassword: boolean;
		isChangingRole: boolean;
		isChangingAccess: boolean;
		onChangeLocale: (next: Locales) => void;
		onRevealDiagnostics: () => void;
		/** change the reader's own password; rejects with what the shared handler has said. */
		onChangePassword: (current: string, next: string) => Promise<void>;
		/**
		 * sign the reader out of their other machines; rejects so the confirm stays open on it.
		 */
		onEndOtherSessions: () => Promise<void>;
		/** sign a member out of every machine, from their row. */
		onEndSessions: (memberId: string) => void;
		onReissue: (memberId: string) => void;
		onRevoke: (invitationId: string) => void;
		/** hand a pending member's link over again, for the person who issued it. */
		onCopyLink: (invitationId: string, username: string) => void;
		/** make a pending member a fresh confirmation code, for the person who issued it. */
		onFreshCode: (invitationId: string, username: string) => void;
		/** ask to remove a member: the route raises the confirm that names what it costs. */
		onRemove: (memberId: string) => void;
		onLockOut: (memberId: string) => void;
		onRename: (memberId: string, username: string) => Promise<void>;
		onChangeRole: (
			memberId: string,
			role: 'administrator' | 'member',
			permissions: number
		) => Promise<void>;
		onChangeAccess: (
			memberId: string,
			changes: { id: string; access: 'none' | 'full-access' | 'read-only' }[]
		) => Promise<void>;
		/** the same grants read the other way round: one workspace, and the members that changed. */
		onChangeWorkspaceAccess: (
			workspaceId: string,
			changes: { memberId: string; access: 'none' | 'full-access' | 'read-only' }[]
		) => Promise<void>;
		/** delete a workspace and its database; rejects so the confirm stays open on the refusal. */
		onDeleteWorkspace: (workspaceId: string) => Promise<void>;
		onAuthorityReconnected: () => void;
		/** forget the organization on this machine; rejects so the confirm stays open. */
		onDisconnect: () => Promise<void>;
	} = $props();

	const sections = $derived(sectionsFor(session, holdsTursoAuthority));
	const shown = $derived(shownSection(section, sections));

	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && !holdsTursoAuthority);
	const canCreateWorkspace = $derived(isOwner && holdsTursoAuthority);
	const canInvite = $derived(permits(session?.permissions ?? 0, 'inviteMember'));
	const canRemove = $derived(permits(session?.permissions ?? 0, 'removeMember'));

	let changePasswordForm = $state<{ reset: () => void } | null>(null);

	/**
	 * the reader's own password, changed from the `you` section. A change that went through
	 * empties the form, because the two values in it are the ones that must not be left on
	 * screen; a refusal is said by the shared handler and the form keeps what was typed.
	 */
	const changePassword = async (current: string, next: string) => {
		try {
			await onChangePassword(current, next);
			changePasswordForm?.reset();
		} catch {
			// said by the shared handler.
		}
	};
</script>

<PageFrame>
	<!-- the title alone, as the settings page has carried it: the rail below names the sections,
	     so a sentence here would list what the tabs already list. -->
	<h1 class="text-3xl font-semibold tracking-tight capitalize">{$LL.settings.title()}</h1>

	<SettingsRail {sections} />

	{#if shown === 'general'}
		<Field.Group>
			<Field.Set>
				<SettingsLocale currentLocale={$locale} onChange={onChangeLocale} />
				<Field.Separator />
				<SettingsEndingSoon {settings} />
			</Field.Set>
		</Field.Group>
	{:else if shown === 'you' && session}
		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.account.groupIdentity()}</Field.Legend>
				<OrganizationIdentity {session} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.account.password.title()}</Field.Legend>
				<Field.Description>{$LL.account.password.description()}</Field.Description>
				<OrganizationChangePasswordForm
					bind:this={changePasswordForm}
					currentLabel={$LL.account.password.currentLabel()}
					isChanging={isChangingPassword}
					errorMessage={null}
					onChange={(current, next) => void changePassword(current, next)}
				/>
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.account.sessions.title()}</Field.Legend>
				<OrganizationEndOtherSessions
					organizationName={session.organizationName}
					{onEndOtherSessions}
				/>
			</Field.Set>
		</Field.Group>
	{:else if shown === 'members' && session}
		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.organization.dashboard.members()}</Field.Legend>
				<OrganizationMembers
					{members}
					workspaces={session.workspaces}
					{canInvite}
					{canRemove}
					canLockOut={isOwner}
					canRename={permits(session.permissions, 'renameMember')}
					canReset={permits(session.permissions, 'resetPassword')}
					canChangeRole={permits(session.permissions, 'changeRole')}
					canGrantWorkspace={permits(session.permissions, 'grantWorkspace')}
					{isOwner}
					selfId={session.memberId}
					{reissuing}
					{revoking}
					{copying}
					{endingSessions}
					{codeFor}
					{isChangingRole}
					{isChangingAccess}
					{onEndSessions}
					{onReissue}
					{onRevoke}
					{onCopyLink}
					{onFreshCode}
					{onRemove}
					{onLockOut}
					{onRename}
					{onChangeRole}
					{onChangeAccess}
				/>
			</Field.Set>
		</Field.Group>
	{:else if shown === 'workspaces' && session}
		<Field.Group>
			<!-- the list owns its own legend, its rows' surfaces and the transfer beneath it; what is
			     decided here is what this reader may do. The refusal is the rail's own sentence, and
			     it is drawn for an owner whose machine lost the authority alone: an administrator
			     never had a create to be refused, so a sentence saying whose it is would be
			     announcing something missing. -->
			<OrganizationWorkspaces
				workspaces={session.workspaces}
				{members}
				openWorkspaceId={syncState?.workspace.remoteId ?? null}
				canCreate={canCreateWorkspace}
				canDelete={isOwner}
				canRename={permits(session.permissions, 'renameWorkspace')}
				canGrantWorkspace={permits(session.permissions, 'grantWorkspace')}
				{isOwner}
				selfId={session.memberId}
				{isChangingAccess}
				refusal={needsAuthority ? $LL.layout.workspaceMenu.workspaceRefusedAuthority() : null}
				onChangeAccess={onChangeWorkspaceAccess}
				onDelete={onDeleteWorkspace}
			/>
		</Field.Group>
	{:else if shown === 'sync' && session}
		<Field.Group>
			{#if syncState}
				<Field.Set>
					<WorkspaceSync {syncState} {session} />
				</Field.Set>

				<Separator />
			{/if}

			<!-- the Turso account, which is the owner's alone: reconnected where this machine holds
			     no authority, and given back where it does. Both are the same subject, so they share
			     the legend rather than standing as two sections a reader meets one of. -->
			{#if isOwner}
				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.authorityTitle()}</Field.Legend>
					{#if needsAuthority}
						<OrganizationReconnectAuthority onReconnected={onAuthorityReconnected} />
					{:else}
						<OrganizationForgetAccount />
					{/if}
				</Field.Set>

				<Separator />

				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.linkTitle()}</Field.Legend>
					<OrganizationLink {isOwner} />
				</Field.Set>

				<Separator />
			{/if}

			<Field.Set>
				<Field.Legend>{$LL.layout.signIn.disconnect()}</Field.Legend>
				<OrganizationDisconnect organizationName={session.organizationName} {onDisconnect} />
			</Field.Set>
		</Field.Group>
	{:else if shown === 'updates'}
		<Field.Group>
			<Field.Set>
				<SettingsUpdates version={settings.version} />
			</Field.Set>
		</Field.Group>
	{:else if shown === 'diagnostics'}
		<Field.Group>
			<Field.Set>
				<SettingsDiagnostics diagnosticsDir={settings.diagnosticsDir} {onRevealDiagnostics} />
			</Field.Set>
		</Field.Group>
	{/if}
</PageFrame>
