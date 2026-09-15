<script lang="ts">
	import type { WorkspaceGrant } from '$lib/platform/tauri';
	import OrganizationInviteForm from '$lib/organization/component/invite-form.svelte';
	import OrganizationWorkspaceDialog from '$lib/organization/component/workspace-dialog.svelte';
	import {
		closeOrganizationDialog,
		dismissInvited,
		organizationDialog,
		resetOrganizationDialogs,
		showInvited,
		type InvitedCopy
	} from '$lib/organization/dialogs.svelte';
	import {
		useCreateWorkspace,
		useFetchOrganizationState,
		useInviteMember
	} from '$lib/organization/query';
	import { onDestroy } from 'svelte';
	import { locale } from '$lib/i18n/i18n-svelte';

	/**
	 * The two organization dialogs, mounted once for the whole shell.
	 *
	 * Inviting a member and creating a workspace are each one form on the shared form surface, and
	 * each is opened from two places that share no parent: the rail's workspace menu and the
	 * organization page. So the surfaces are drawn here, beside the frame rather than inside it,
	 * since the frame owns navigation and not forms, and `organization/dialogs.svelte.ts` is the
	 * request the openers raise and this answers. One instance is one result panel: an invitation
	 * made from the menu shows its link in the same panel a person finds from the page.
	 *
	 * **The mutations are here**, inside the providers, so each reads the query client from context
	 * the way every other hook does. The organization state query is the same one the rail and the
	 * page read, so the workspaces the invite offers are the ones the session lists, and a created
	 * workspace reaches the rail's switcher and the page's list through the one invalidation.
	 *
	 * **Drawn while the rail is up and a session is held**, which `routes/+layout.svelte` decides;
	 * what is here on unmount is reset, so nothing an invitation made outlives the session it was
	 * made in and a dialog left open at sign-out does not reopen on the next sign-in.
	 */
	const stateQuery = useFetchOrganizationState();
	const inviteMember = useInviteMember();
	const createWorkspace = useCreateWorkspace();

	const session = $derived(stateQuery.data?.session ?? null);
	const isOwner = $derived(session?.role === 'owner');

	let copied = $state<InvitedCopy | null>(null);

	// a new result is a new link to copy, whether it came from the invite here or from a reset
	// raised on the page, so the mark follows the result rather than the act that made it.
	$effect(() => {
		void organizationDialog.invited;
		copied = null;
	});

	// the form names each workspace with the access it is granted at, which is what the command
	// takes. What comes back is narrowed to the link and the person it admits, because the same
	// panel answers a new link and a copy link, and neither of those produces anything wider.
	const invite = async (
		username: string,
		role: 'administrator' | 'member',
		workspaces: WorkspaceGrant[]
	) => {
		try {
			const invited = await inviteMember.mutateAsync({ username, role, workspaces });

			showInvited({
				invitationId: invited.invitationId,
				username: invited.username,
				joinLink: invited.joinLink,
				code: invited.code,
				expiresAt: invited.expiresAt,
				unreachableWorkspaces: invited.unreachableWorkspaces
			});
		} catch {
			// said by the shared handler; the form keeps what was typed.
		}
	};

	const copy = async (what: InvitedCopy, value: string) => {
		try {
			await navigator.clipboard.writeText(value);
			copied = what;
		} catch {
			copied = null;
		}
	};

	const create = async (name: string) => {
		try {
			await createWorkspace.mutateAsync({ name });
		} catch {
			// said by the shared handler; the surface keeps what they typed.
			return;
		}

		closeOrganizationDialog();
	};

	onDestroy(() => {
		resetOrganizationDialogs();
	});
</script>

<!-- keyed on the locale: both surfaces build their validation messages from the locale when they
     are built, and this host is built once per session, so a locale changed on the settings page
     would otherwise leave the two forms refusing in the previous one until sign-out. -->
{#if session}
	{#key $locale}
		<OrganizationInviteForm
			open={organizationDialog.open === 'invite'}
			onOpenChange={(open) => {
				if (!open) closeOrganizationDialog();
			}}
			organizationName={session.organizationName}
			workspaces={session.workspaces}
			canInviteAdministrators={isOwner}
			canGrantReadOnly={isOwner}
			isInviting={inviteMember.isPending}
			invited={organizationDialog.invited}
			{copied}
			onInvite={(username, role, workspaces) => void invite(username, role, workspaces)}
			onCopy={(what, value) => void copy(what, value)}
			onDismiss={dismissInvited}
		/>

		<OrganizationWorkspaceDialog
			open={organizationDialog.open === 'workspace'}
			onOpenChange={(open) => {
				if (!open) closeOrganizationDialog();
			}}
			isCreating={createWorkspace.isPending}
			onCreate={(name) => void create(name)}
		/>
	{/key}
{/if}
