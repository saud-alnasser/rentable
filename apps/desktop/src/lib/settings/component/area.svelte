<script lang="ts">
	import type api from '$lib/api/caller';
	import type {
		MemberStanding,
		OrganizationMember,
		OrganizationSession,
		RemoteSyncState
	} from '$lib/platform/host';
	import type { Locales } from '$lib/i18n/i18n-types';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { toErrorText } from '$lib/error/message';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import OrganizationAcceptOwnership from '$lib/organization/component/accept-ownership.svelte';
	import OrganizationChangePasswordDialog from '$lib/organization/component/change-password-dialog.svelte';
	import OrganizationDeleteOrganization from '$lib/organization/component/delete-organization.svelte';
	import OrganizationDisconnect from '$lib/organization/component/disconnect.svelte';
	import OrganizationEndOtherSessions from '$lib/organization/component/end-other-sessions.svelte';
	import OrganizationForgetAccount from '$lib/organization/component/forget-account.svelte';
	import OrganizationIdentity from '$lib/organization/component/identity.svelte';
	import OrganizationMembers from '$lib/organization/component/members.svelte';
	import OrganizationReconnectAuthority from '$lib/organization/component/reconnect-authority.svelte';
	import OrganizationWorkspaces from '$lib/organization/component/workspaces.svelte';
	import SettingsDiagnostics from '$lib/settings/component/diagnostics.svelte';
	import SettingsEndingSoon from '$lib/settings/component/ending-soon.svelte';
	import SettingsLocale from '$lib/settings/component/locale.svelte';
	import SettingsRail from '$lib/settings/component/rail.svelte';
	import SettingsUpdates from '$lib/settings/component/updates.svelte';
	import {
		administersMembers,
		holdingSection,
		sectionsFor,
		shownSection,
		type AddressableSection
	} from '$lib/settings/section';
	import WorkspaceSync from '$lib/workspace/component/sync.svelte';
	import { permits } from '@rentable/workspace-permission';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

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
	 * carries what a person reads about themselves; organization carries the sync status, the Turso
	 * account, the members directory and the two acts that end something; workspaces carries the
	 * directory and the transfer beneath it. Nothing moved between sections beyond that list.
	 *
	 * **Inside a section: what it is about, then what it holds, then what ends something, at the
	 * foot.** *Settled by the human on the real organization, on the four sections above.* Account
	 * opens with the offer where one stands, because it is the one block there waiting on a reply.
	 * Organization opens with how this machine stands to the organization and closes with leaving
	 * it. What each block is gated on did not change with the order.
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
	 * **Each block is one component, and this composes rather than draws.** The members list, the
	 * workspaces list and the sync blocks each own their rows, their dialogs and their gates; what
	 * is here is which of them a reader is offered and what they are handed. *The workspaces and
	 * sync blocks were the retired pages' components stood side by side until ticket 11 rebuilt
	 * them.*
	 */
	let {
		section,
		settings,
		session,
		holdsTursoAuthority,
		syncState,
		members,
		standings,
		makingLink,
		unsetting,
		endingSessions,
		isChangingPassword,
		isChangingRole,
		isChangingAccess,
		isOffering,
		isWithdrawing,
		isAcceptingOwnership,
		isDeletingOrganization,
		onChangeLocale,
		onRevealDiagnostics,
		onChangePassword,
		onEndOtherSessions,
		onEndSessions,
		onMakeLink,
		onUnsetPassword,
		onRemove,
		onLockOut,
		onRename,
		onChangeRole,
		onChangeAccess,
		onOfferOwnership,
		onWithdrawOffer,
		onAcceptOwnership,
		onChangeWorkspaceAccess,
		onDeleteWorkspace,
		onAuthorityReconnected,
		onDeleteOrganization,
		onDisconnect
	}: {
		/**
		 * the section the address named. One this reader is not offered draws the default, and a
		 * name a section used to go by draws the section that holds what it held.
		 */
		section: AddressableSection;
		settings: AppSettings;
		/** who is reading, or `null` on the way in, where the area still draws three sections. */
		session: OrganizationSession | null;
		/** whether this machine holds the Turso authority: the owner's, after a consent. */
		holdsTursoAuthority: boolean;
		/** the machine's sync record; `null` until it has been read, and while signed out. */
		syncState: RemoteSyncState | null;
		members: OrganizationMember[];
		/** where each account stands, as the members section draws it in a line. */
		standings: MemberStanding[];
		/** the account a link is being made for, while it is. */
		makingLink: string | null;
		/** the account whose password is being unset, while it is. */
		unsetting: string | null;
		/** the member whose sessions are being ended, while they are. */
		endingSessions: string | null;
		isChangingPassword: boolean;
		isChangingRole: boolean;
		isChangingAccess: boolean;
		/** the offer is being written, which is a signed row, a succession row and a push. */
		isOffering: boolean;
		/** the offer is being taken back. */
		isWithdrawing: boolean;
		/** the organization is being accepted, which re-keys the whole directory and pushes it. */
		isAcceptingOwnership: boolean;
		/** the organization is being deleted, which is several requests and a sweep of the disk. */
		isDeletingOrganization: boolean;
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
		/** make the one link that admits a machine to an account (effort 828, requirement 20). */
		onMakeLink: (memberId: string) => void;
		/** unset an account's password, so the next link made for it asks for a new one. */
		onUnsetPassword: (memberId: string) => void;
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
		/**
		 * offer the organization to another account, with the owner's own password (effort 828,
		 * requirement 22). Rejects with what the shared handler has said, which the members
		 * section puts on the password.
		 */
		onOfferOwnership: (memberId: string, password: string) => Promise<void>;
		/** take that offer back, which leaves the organization where it was. */
		onWithdrawOffer: () => void;
		/**
		 * accept the organization offered to this reader, with their own password. Rejects with
		 * what the shared handler has said, which the you section puts on the password.
		 */
		onAcceptOwnership: (password: string) => Promise<void>;
		/** the same grants read the other way round: one workspace, and the members that changed. */
		onChangeWorkspaceAccess: (
			workspaceId: string,
			changes: { memberId: string; access: 'none' | 'full-access' | 'read-only' }[]
		) => Promise<void>;
		/** delete a workspace and its database; rejects so the confirm stays open on the refusal. */
		onDeleteWorkspace: (workspaceId: string) => Promise<void>;
		onAuthorityReconnected: () => void;
		/**
		 * delete the organization with the owner's password: every workspace database and the
		 * organization's own go from the Turso account and this machine forgets what it held.
		 * Rejects with what the shared handler has said, which this puts on the password.
		 */
		onDeleteOrganization: (password: string) => Promise<void>;
		/** forget the organization on this machine; rejects so the confirm stays open. */
		onDisconnect: () => Promise<void>;
	} = $props();

	const sections = $derived(sectionsFor(session, holdsTursoAuthority));
	const shown = $derived(shownSection(holdingSection(section), sections));

	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && !holdsTursoAuthority);
	const canCreateWorkspace = $derived(isOwner && holdsTursoAuthority);
	const canInvite = $derived(permits(session?.permissions ?? 0, 'inviteMember'));
	const canRemove = $derived(permits(session?.permissions ?? 0, 'removeMember'));
	// the directory is the organization section's own gate: it was a section of its own, and what
	// admitted a reader to that section now decides whether the block is drawn.
	const administers = $derived(administersMembers(session));

	let changingPassword = $state(false);
	/** what the shell refused the last change with, marked on the dialog's current-password field. */
	let passwordRefusal = $state<string | null>(null);

	/**
	 * the reader's own password, changed from the account section.
	 *
	 * A change that went through closes the surface, which empties it: the two values on it are
	 * the ones that must not be left on screen. A refusal keeps it open with what was typed, and
	 * the sentence the shared handler already said in a toast is put back on the field it belongs
	 * to, because the current password is what the shell refuses this with
	 * ([[rules/interface]], *Validation errors*).
	 */
	const changePassword = async (current: string, next: string) => {
		passwordRefusal = null;

		try {
			await onChangePassword(current, next);
			changingPassword = false;
		} catch (error) {
			passwordRefusal = toErrorText(error, $LL);
		}
	};

	/** what the shell refused the last offer with, marked on the surface's password field. */
	let offerRefusal = $state<string | null>(null);

	/**
	 * the organization, offered to another account from the members directory.
	 *
	 * The same shape the password change and the delete have, and for the same reason: the surface
	 * that went through closes and empties, and a refusal keeps it open and puts the sentence on
	 * the password, because the password is what the shell refuses this with ([[rules/interface]],
	 * *Validation errors*). Nothing about what the owner sees changes on an offer: they are still
	 * the owner until the other person accepts, and their card carries the withdrawal instead.
	 */
	const offerOwnership = async (memberId: string, password: string) => {
		offerRefusal = null;

		try {
			await onOfferOwnership(memberId, password);
		} catch (error) {
			offerRefusal = toErrorText(error, $LL);

			throw error;
		}
	};

	let acceptingOwnership = $state(false);
	/** what the shell refused the last acceptance with, marked on its password field. */
	let acceptRefusal = $state<string | null>(null);

	/**
	 * the organization, accepted from the account section.
	 *
	 * The same shape again. What this reader sees afterwards is an owner's settings area, because
	 * the session's role is refreshed with the act, and the surface closes because the offer it
	 * was drawn for is spent.
	 */
	const acceptOwnership = async (password: string) => {
		acceptRefusal = null;

		try {
			await onAcceptOwnership(password);
			acceptingOwnership = false;
		} catch (error) {
			acceptRefusal = toErrorText(error, $LL);
		}
	};

	let deletingOrganization = $state(false);
	/** what the shell refused the last delete with, marked on the surface's password field. */
	let deleteRefusal = $state<string | null>(null);

	/**
	 * the organization, deleted from the organization section.
	 *
	 * The same shape the password change has, and for the same reason: a delete that went through
	 * closes the surface, which empties the one value on it, and a refusal keeps it open with what
	 * was typed and puts the sentence on the password, because the password is what the shell
	 * refuses this with ([[rules/interface]], *Validation errors*). Nothing is drawn afterwards
	 * either way, since the machine that deleted the organization is a machine holding nothing.
	 */
	const deleteOrganization = async (password: string) => {
		deleteRefusal = null;

		try {
			await onDeleteOrganization(password);
			deletingOrganization = false;
		} catch (error) {
			deleteRefusal = toErrorText(error, $LL);
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
			<!-- what the section is named for goes first and takes no legend of its own: the rail
			     above already says general, and a legend repeating it is the tab said twice. The two
			     below carry one each, because they are things of their own under that name. -->
			<Field.Set data-general>
				<SettingsLocale currentLocale={$locale} onChange={onChangeLocale} />
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
	{:else if shown === 'account' && session}
		<Field.Group>
			<!-- the offer first, and only where one stands: it is the one thing in this section
			     waiting on the reader, and everything under it is a fact about their account that
			     will read the same tomorrow (requirement 22). *It stood last while it was the block
			     most often absent; the human read the four sections and asked for what is waiting to
			     come first.* -->
			{#if session.ownershipOffered}
				<Field.Set>
					<Field.Legend>{$LL.settings.you.ownership.title()}</Field.Legend>
					<Field.Field orientation="vertical" data-ownership-offer>
						<Field.Content>
							<Field.Description>
								{$LL.settings.you.ownership.offered({ owner: session.ownerUsername })}
							</Field.Description>
						</Field.Content>

						<div>
							<Button
								type="button"
								variant="outline"
								data-accept-ownership-open
								onclick={() => {
									acceptRefusal = null;
									acceptingOwnership = true;
								}}
							>
								<CrownIcon class="size-4" />
								{$LL.organization.dashboard.acceptOwnership()}
							</Button>
						</div>
					</Field.Field>
				</Field.Set>

				<Separator />
			{/if}

			<!-- then who this reader is, then the one thing they change about themselves, then the
			     machines they left signed in: the section is about them, so it opens with them. -->
			<Field.Set>
				<Field.Legend>{$LL.settings.you.signedInAs()}</Field.Legend>
				<OrganizationIdentity {session} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.settings.you.password.title()}</Field.Legend>
				<!-- the fact, and the control that opens the write: nothing about the password is
				     drawn until the person asks to change it (requirement 8). -->
				<Field.Field orientation="vertical" data-password>
					<Field.Content>
						<Field.Description>{$LL.settings.you.password.description()}</Field.Description>
					</Field.Content>

					<div>
						<!-- the verb's glyph before its label; outline rather than solid, since the act is
						     offered and never invited. -->
						<Button
							type="button"
							variant="outline"
							data-change-password-open
							onclick={() => {
								passwordRefusal = null;
								changingPassword = true;
							}}
						>
							<KeyRoundIcon class="size-4" />
							{$LL.settings.you.password.change()}
						</Button>
					</div>
				</Field.Field>
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.settings.you.sessions.title()}</Field.Legend>
				<OrganizationEndOtherSessions
					organizationName={session.organizationName}
					{onEndOtherSessions}
				/>
			</Field.Set>
		</Field.Group>

		<OrganizationChangePasswordDialog
			open={changingPassword}
			onOpenChange={(open) => {
				changingPassword = open;

				if (!open) passwordRefusal = null;
			}}
			currentLabel={$LL.settings.you.password.currentLabel()}
			isChanging={isChangingPassword}
			errorMessage={passwordRefusal}
			onChange={(current, next) => void changePassword(current, next)}
		/>

		<OrganizationAcceptOwnership
			open={acceptingOwnership}
			onOpenChange={(open) => {
				acceptingOwnership = open;

				if (!open) acceptRefusal = null;
			}}
			organizationName={session.organizationName}
			ownerUsername={session.ownerUsername}
			isAccepting={isAcceptingOwnership}
			errorMessage={acceptRefusal}
			onAccept={(password) => void acceptOwnership(password)}
		/>
	{:else if shown === 'organization' && session}
		<Field.Group>
			<!-- how this machine stands to the organization first: it is what the section is about,
			     it is what a reader who came here worried is looking for, and it reads the same for
			     everybody. Then the account the databases sit on, then the people, then the two acts
			     that end something. *The directory stood first until the human read the four
			     sections and asked for the elements in each to be ordered.* -->
			{#if syncState}
				<Field.Set data-sync-status>
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
			{/if}

			<!-- the people. The directory owns its own legend, the sentence under it, the cards and
			     the add at its foot; what is decided here is what this reader may do, and a member
			     who changes nobody's row meets no directory at all. -->
			{#if administers}
				<OrganizationMembers
					{members}
					{standings}
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
					{makingLink}
					{unsetting}
					{endingSessions}
					{isChangingRole}
					{isChangingAccess}
					{isOffering}
					{isWithdrawing}
					{offerRefusal}
					{onEndSessions}
					{onMakeLink}
					{onUnsetPassword}
					{onRemove}
					{onLockOut}
					{onRename}
					{onChangeRole}
					{onChangeAccess}
					{onWithdrawOffer}
					onOfferOwnership={offerOwnership}
				/>

				<Separator />
			{/if}

			<!-- and the foot, where both acts end something: leaving with this machine, and leaving
			     with the organization. One legend over the two, because what they have in common is
			     the thing a reader needs to know before reading either, and the heavier one is last.
			     The delete is the owner's and needs the authority the block above is about, so an
			     owner whose machine holds none meets the disconnect alone, exactly as they did while
			     the delete sat inside that block. -->
			<Field.Set data-leaving>
				<Field.Legend>{$LL.organization.dashboard.leavingTitle()}</Field.Legend>
				<OrganizationDisconnect organizationName={session.organizationName} {onDisconnect} />

				{#if isOwner && !needsAuthority}
					<Field.Separator />

					<OrganizationDeleteOrganization
						open={deletingOrganization}
						onOpenChange={(value) => {
							deletingOrganization = value;

							if (!value) deleteRefusal = null;
						}}
						isDeleting={isDeletingOrganization}
						errorMessage={deleteRefusal}
						onDelete={(password) => void deleteOrganization(password)}
					/>
				{/if}
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
	{/if}
</PageFrame>
