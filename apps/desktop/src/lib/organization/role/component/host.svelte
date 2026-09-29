<script lang="ts">
	import DeleteDialog from '@rentable/design/block/delete-dialog.svelte';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import RoleEditor, { type RoleEdit } from '$lib/organization/role/component/editor.svelte';
	import { newRolePlace, roleNameOf } from '$lib/organization/role/role';
	import {
		useCreateRole,
		useDeleteRole,
		useMoveRole,
		useRenameRole,
		useSetRoleMask
	} from '$lib/organization/role/query';
	import { organizationHostState } from '$lib/organization/host.svelte';
	import type { OrganizationRole, OrganizationSession } from '$lib/organization/host';
	import { untrack } from 'svelte';

	/**
	 * Every surface a role act opens, and the move one runs on the press: the role editor and the
	 * delete. Mounted by the organization host (`../../component/host.svelte`), which reads the
	 * session and the roles once for every part of it and resets what is here as it goes.
	 */
	let {
		session,
		roles
	}: {
		/** the session the organization host reads, or `null` while it is being read. */
		session: OrganizationSession | null;
		/** the roles, read by the organization host while a surface that chooses or edits one is open. */
		roles: OrganizationRole[];
	} = $props();

	const role = $derived(organizationHostState.role);

	const createRole = useCreateRole();
	const renameRole = useRenameRole();
	const setRoleMask = useSetRoleMask();
	const moveRole = useMoveRole();
	const deleteRole = useDeleteRole();

	// ----- the roles

	/** what the shell refused the last save of the role editor with, on the part that asked. */
	let roleNameRefusal = $state<string | null>(null);
	let roleFlagsRefusal = $state<string | null>(null);

	const roleEditorOpen = $derived(role.editing !== null || role.creating);
	const isSavingRole = $derived(
		createRole.isPending || renameRole.isPending || setRoleMask.isPending
	);

	// a fresh editor starts with nothing marked from the last one.
	$effect(() => {
		if (roleEditorOpen) {
			untrack(() => {
				roleNameRefusal = null;
				roleFlagsRefusal = null;
			});
		}
	});

	const closeRoleEditor = () => {
		organizationHostState.role.editing = null;
		organizationHostState.role.creating = false;
	};

	/**
	 * one save of the role editor. A new role is one write, placed just above the member; an
	 * existing one is its name and its mask, each asked for only where it changed, and each refused
	 * on its own part of the surface.
	 */
	const saveRole = async (edit: RoleEdit) => {
		const editing = role.editing?.role ?? null;

		roleNameRefusal = null;
		roleFlagsRefusal = null;

		if (!editing) {
			try {
				await createRole.mutateAsync({
					name: edit.name,
					mask: edit.mask,
					afterRoleId: newRolePlace(roles)
				});
				closeRoleEditor();
			} catch (error) {
				roleFlagsRefusal = toErrorText(error, $LL);
			}

			return;
		}

		if (editing.kind === 'custom' && edit.name !== editing.name) {
			try {
				await renameRole.mutateAsync({ roleId: editing.id, name: edit.name });
			} catch (error) {
				roleNameRefusal = toErrorText(error, $LL);
			}
		}

		if (edit.mask !== editing.mask) {
			try {
				await setRoleMask.mutateAsync({ roleId: editing.id, mask: edit.mask });
			} catch (error) {
				roleFlagsRefusal = toErrorText(error, $LL);
			}
		}

		if (!roleNameRefusal && !roleFlagsRefusal) closeRoleEditor();
	};

	// a move asked for on the press runs here, once, the way the member writes above do.
	$effect(() => {
		const moving = organizationHostState.role.moving;

		if (!moving) return;

		organizationHostState.role.moving = null;
		untrack(() => {
			organizationHostState.role.pending.moving = true;
			moveRole
				.mutateAsync(moving)
				.catch(() => {
					// said by the shared handler.
				})
				.finally(() => {
					organizationHostState.role.pending.moving = false;
				});
		});
	});

	const confirmRoleDelete = async () => {
		const deleting = role.deleting;

		if (!deleting) return;

		await deleteRole.mutateAsync({ roleId: deleting.role.id });
	};
</script>

<RoleEditor
	open={roleEditorOpen}
	onOpenChange={(open) => {
		if (!open && !isSavingRole) closeRoleEditor();
	}}
	role={role.editing?.role ?? null}
	holders={role.editing?.members.filter((held) => held.roleId === role.editing?.role.id) ?? []}
	readerPermissions={session?.permissions ?? 0}
	isSaving={isSavingRole}
	nameRefusal={roleNameRefusal}
	flagsRefusal={roleFlagsRefusal}
	onSave={(edit) => void saveRole(edit)}
/>

<!-- deleting a role moves its holders to the member role, and no organization act is undone, so
     it asks first and says what happens to them. -->
<DeleteDialog
	open={role.deleting !== null}
	onOpenChange={(value) => {
		if (!value) organizationHostState.role.deleting = null;
	}}
	onSubmit={confirmRoleDelete}
	record={role.deleting ? roleNameOf($LL, role.deleting.role) : ''}
	title={$LL.organization.roleList.deleteTitle()}
	description={$LL.organization.roleList.deleteDescription()}
	confirmLabel={$LL.organization.roleList.deleteTitle()}
	confirmLoadingLabel={$LL.common.actions.working()}
/>
