<script lang="ts">
	import type { WorkspaceGrant } from '$lib/platform/tauri';
	import OrganizationAccountForm from '$lib/organization/component/account-form.svelte';
	import OrganizationMadeLink from '$lib/organization/component/made-link.svelte';
	import OrganizationWorkspaceDialog from '$lib/organization/component/workspace-dialog.svelte';
	import {
		closeOrganizationDialog,
		dismissMadeLink,
		organizationDialog,
		resetOrganizationDialogs
	} from '$lib/organization/dialogs.svelte';
	import {
		useCreateAccount,
		useCreateWorkspace,
		useFetchOrganizationState,
		useFetchRoles
	} from '$lib/organization/query';
	import { onDestroy } from 'svelte';
	import { locale } from '$lib/i18n/i18n-svelte';

	/**
	 * The organization surfaces, mounted once for the whole shell.
	 *
	 * Making an account and creating a workspace are each one form on the shared form surface, and
	 * the link an account's own act produces is one panel beside them. Each is opened from a place
	 * that shares no parent with the others, so the surfaces are drawn here, beside the frame
	 * rather than inside it, since the frame owns navigation and not forms, and
	 * `organization/dialogs.svelte.ts` is the request the openers raise and this answers. One
	 * instance is one panel: a link made from anywhere is shown in the same place.
	 *
	 * **The mutations are here**, inside the providers, so each reads the query client from context
	 * the way every other hook does. The organization state query is the same one the rail and the
	 * settings area read, so the workspaces an account can be given are the ones the session lists,
	 * and a created workspace reaches the rail's switcher and the area's list through the one
	 * invalidation.
	 *
	 * **Drawn while the rail is up and a session is held**, which `routes/+layout.svelte` decides;
	 * what is here on unmount is reset, so no link outlives the session it was made in and a
	 * surface left open at sign-out does not reopen on the next sign-in.
	 */
	const stateQuery = useFetchOrganizationState();
	const createAccount = useCreateAccount();
	const createWorkspace = useCreateWorkspace();

	const session = $derived(stateQuery.data?.session ?? null);
	// the roles an account can be made in, read while the form that makes one is open.
	const rolesQuery = useFetchRoles(() => organizationDialog.open === 'account');
	const isOwner = $derived(session?.role === 'owner');

	// the form names each workspace with the access it is granted at, which is what the command
	// takes. Nothing comes back to show: an account holds no password until a link is made for it,
	// and making one is its own act on the account.
	const create = async (
		username: string,
		roleId: string,
		override: number,
		workspaces: WorkspaceGrant[]
	) => {
		try {
			await createAccount.mutateAsync({ username, roleId, override, workspaces });
		} catch {
			// said by the shared handler; the form keeps what was typed.
			return;
		}

		closeOrganizationDialog();
	};

	const createTheWorkspace = async (name: string) => {
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

<!-- keyed on the locale: both forms build their validation messages from the locale when they
     are built, and this host is built once per session, so a locale changed on the settings page
     would otherwise leave the two forms refusing in the previous one until sign-out. -->
{#if session}
	{#key $locale}
		<OrganizationAccountForm
			open={organizationDialog.open === 'account'}
			onOpenChange={(open) => {
				if (!open) closeOrganizationDialog();
			}}
			workspaces={session.workspaces}
			roles={rolesQuery.data ?? []}
			readerRank={session.rank}
			readerPermissions={session.permissions}
			canGrantReadOnly={isOwner}
			isCreating={createAccount.isPending}
			onCreate={(username, roleId, override, workspaces) =>
				void create(username, roleId, override, workspaces)}
		/>

		<OrganizationWorkspaceDialog
			open={organizationDialog.open === 'workspace'}
			onOpenChange={(open) => {
				if (!open) closeOrganizationDialog();
			}}
			isCreating={createWorkspace.isPending}
			onCreate={(name) => void createTheWorkspace(name)}
		/>
	{/key}

	<OrganizationMadeLink
		organizationName={session.organizationName}
		made={organizationDialog.madeLink}
		onDismiss={dismissMadeLink}
	/>
{/if}
