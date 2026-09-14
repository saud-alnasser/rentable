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
	 * *The workspaces and sync sections are composed here from the components the four pages
	 * drew, unchanged, so every section works at this commit; ticket 11 rebuilds the first and
	 * finishes the second. The members section is its own component and was rebuilt as one list
	 * at ticket 10, which is why this draws it and nothing else: the invite button, the pending
	 * rows and the three light dialogs are all the list's.*
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
		isChangingPassword,
		isChangingRole,
		isChangingAccess,
		onChangeLocale,
		onRevealDiagnostics,
		onChangePassword,
		onReissue,
		onRevoke,
		onCopyLink,
		onRemove,
		onLockOut,
		onRename,
		onChangeRole,
		onChangeAccess,
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
		isChangingPassword: boolean;
		isChangingRole: boolean;
		isChangingAccess: boolean;
		onChangeLocale: (next: Locales) => void;
		onRevealDiagnostics: () => void;
		/** change the reader's own password; rejects with what the shared handler has said. */
		onChangePassword: (current: string, next: string) => Promise<void>;
		onReissue: (memberId: string) => void;
		onRevoke: (invitationId: string) => void;
		/** hand a pending member's link over again, for the person who issued it. */
		onCopyLink: (invitationId: string, username: string) => void;
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
					{isChangingRole}
					{isChangingAccess}
					{onReissue}
					{onRevoke}
					{onCopyLink}
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
			<Field.Set>
				<!-- gated as the rail's row is, with the rail's sentences: an owner whose machine lost
				     the authority reads why rather than meeting a create the shell refuses. -->
				<OrganizationWorkspaces
					workspaces={session.workspaces}
					canCreate={canCreateWorkspace}
					refusal={canCreateWorkspace
						? null
						: isOwner
							? $LL.layout.workspaceMenu.workspaceRefusedAuthority()
							: $LL.layout.workspaceMenu.workspaceRefusedOwner()}
				/>
			</Field.Set>
		</Field.Group>
	{:else if shown === 'sync' && session}
		<Field.Group>
			{#if syncState}
				<Field.Set>
					<WorkspaceSync {syncState} {session} />
				</Field.Set>

				<Separator />
			{/if}

			{#if needsAuthority}
				<Field.Set>
					<Field.Legend>{$LL.organization.dashboard.authorityTitle()}</Field.Legend>
					<OrganizationReconnectAuthority onReconnected={onAuthorityReconnected} />
				</Field.Set>

				<Separator />
			{/if}

			{#if isOwner}
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
