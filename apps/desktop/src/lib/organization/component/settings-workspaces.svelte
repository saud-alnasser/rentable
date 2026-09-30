<script lang="ts">
	import type { SettingsSectionProps } from '$lib/feature/surface';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationWorkspaces from '$lib/organization/workspace/component/directory.svelte';
	import { workspaceContextOf } from '$lib/organization/workspace/acts';
	import { useFetchMembers } from '$lib/organization/member/query';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { useFetchRemoteSyncState } from '$lib/sync/ui';

	/**
	 * The settings area's workspaces section: the directory of the workspaces this member holds,
	 * and the transfer beneath it. The organization contributes it (`surface.ts`), and the area
	 * draws it while somebody is signed in.
	 *
	 * **What it reads is its own**, the way a record's section reads its records; a workspace's
	 * acts are the organization host's, in the frame (effort 832, requirement 8). *The settings
	 * route read the session, the members and the sync record and handed them to the area until
	 * effort 840, when the area stopped naming the organization.*
	 */
	// what the area hands every section it draws. Nothing this section does lets go of the
	// organization, so it reads none of it; declared so the section is typed as one.
	// eslint-disable-next-line no-empty-pattern
	let {}: SettingsSectionProps = $props();

	const stateQuery = useFetchOrganizationState();
	const session = $derived(stateQuery.data?.session ?? null);
	const holdsTursoAuthority = $derived(stateQuery.data?.holdsTursoAuthority === true);

	const syncQuery = useFetchRemoteSyncState(() => session !== null);
	const membersQuery = useFetchMembers();

	const isOwner = $derived(session?.role === 'owner');
	// an owner restored on this machine holds no Turso authority until they repeat the consent.
	const needsAuthority = $derived(isOwner && !holdsTursoAuthority);
	const canCreateWorkspace = $derived(isOwner && holdsTursoAuthority);
</script>

{#if session}
	<Field.Group>
		<!-- the list owns its own legend, its rows' surfaces and the transfer beneath it; what is
		     decided here is what this reader may do. The refusal is the rail's own sentence, and
		     it is drawn for an owner whose machine lost the authority alone: nobody else ever
		     had a create to be refused, so a sentence saying whose it is would be
		     announcing something missing. -->
		<OrganizationWorkspaces
			workspaces={session.workspaces}
			members={membersQuery.data ?? []}
			{...workspaceContextOf(session, syncQuery.data?.workspace.remoteId ?? null)}
			canCreate={canCreateWorkspace}
			refusal={needsAuthority ? $LL.layout.workspaceMenu.workspaceRefusedAuthority() : null}
		/>
	</Field.Group>
{/if}
