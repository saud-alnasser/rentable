<script lang="ts">
	import { useChangeAccess } from '$lib/organization/access/query';
	import MemberHost from '$lib/organization/member/component/host.svelte';
	import RoleHost from '$lib/organization/role/component/host.svelte';
	import { useFetchRoles } from '$lib/organization/role/query';
	import WorkspaceHost from '$lib/organization/workspace/component/host.svelte';
	import UpgradeHost from '$lib/organization/upgrade/component/host.svelte';
	import { organizationHostState, resetOrganizationHost } from '$lib/organization/host.svelte';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { onDestroy } from 'svelte';

	/**
	 * Every surface a member act, a workspace act or a role act opens, and every write one runs on
	 * the press, mounted once for the whole shell.
	 *
	 * The acts are lists (`member/acts.ts`, `workspace/acts.ts` and `role/acts.ts`), and the
	 * settings directories draw them as projections of those lists; what the acts open is here, the
	 * way a contract's acts open what `contract/component/host.svelte` holds.
	 * `organization/host.svelte.ts` is the request the directories raise and this answers.
	 *
	 * **The mutations are here**, inside the providers, so each reads the query client from context
	 * the way every other hook does. What they write, what each announces, and which surfaces stay
	 * open on a refusal are unchanged from when the settings route held them.
	 *
	 * **What an act was gated on travels with it.** The record a surface opens on carries what the
	 * reader may write of it, so the sheet draws the sections the card's gates allowed and nothing
	 * the reader's row does not carry; Rust refuses every one of them again on the signed row.
	 *
	 * **Drawn while a session is held**, which the frame decides; what is here on unmount is reset,
	 * so a surface left open at sign-out does not reopen on the next sign-in.
	 *
	 * **Each sub-concept draws its own** (`member/component/host.svelte`, then the workspace's and
	 * the role's), in the order their surfaces always stood. What they share is read here once: the
	 * session and the roles, and the member's sheet's access write. *A workspace's access dialog
	 * shared that write, and the members were read here for it, until effort 846's ticket 49 gave a
	 * workspace a page of its own that reads and writes them itself.*
	 */
	const stateQuery = useFetchOrganizationState();

	const member = $derived(organizationHostState.member);
	const role = $derived(organizationHostState.role);

	const session = $derived(stateQuery.data?.session ?? null);

	// the roles, read while a surface that chooses or edits one is open: the organization section
	// of the settings area reads them already, so this is the same cache.
	const rolesQuery = useFetchRoles(
		() => member.editing !== null || role.editing !== null || role.creating
	);
	const roles = $derived(rolesQuery.data ?? []);

	const changeAccess = useChangeAccess();

	const refetchState = () => stateQuery.refetch();

	onDestroy(resetOrganizationHost);
</script>

<MemberHost {session} {roles} {changeAccess} {refetchState} />

<WorkspaceHost {changeAccess} {refetchState} />

<RoleHost {session} {roles} />

<!-- the upgrade sheet, opened from the organization's card and a workspace's (effort 857). -->
<UpgradeHost />
