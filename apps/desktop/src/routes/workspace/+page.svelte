<script lang="ts">
	import PageFrame from '$lib/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import { signedInAccount } from '$lib/sync/account';
	import WorkspaceIdentity from '$lib/workspace/component/identity.svelte';
	import WorkspaceMembers from '$lib/workspace/component/members.svelte';
	import WorkspaceSync from '$lib/workspace/component/sync.svelte';
	import WorkspaceTransfer from '$lib/workspace/component/transfer.svelte';

	/**
	 * The workspace, as a page of its own.
	 *
	 * **It exists because the workspace had nowhere to grow.** Its name and its sync state were a
	 * group on the application's settings page, which is the page about language and update
	 * checks; a workspace with an icon and members is not a group on that page. Directed by the
	 * human on 2026-08-20, after the sidebar controls were on screen.
	 *
	 * **No loading branch and no empty branch, and that is the startup path's doing.**
	 * `+layout.svelte` renders navigation only at `startupState === 'ready'`, which is past
	 * admission, and it writes the state into this query's key before the shell mounts. A page
	 * inside the shell cannot be reached before either has happened.
	 */
	const remoteSyncQuery = useFetchRemoteSyncState();

	const syncState = $derived(remoteSyncQuery.data);
	const account = $derived(signedInAccount(remoteSyncQuery.data));
</script>

{#if syncState}
	<PageFrame>
		<h1 class="text-3xl font-semibold tracking-tight capitalize">{$LL.workspace.title()}</h1>

		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.workspace.groupIdentity()}</Field.Legend>
				<WorkspaceIdentity workspace={syncState.workspace} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.workspace.groupMembers()}</Field.Legend>
				{#if account}
					<WorkspaceMembers {account} />
				{/if}
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.workspace.groupSync()}</Field.Legend>
				<WorkspaceSync {syncState} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<!-- beside sync, because both are answers to the same question: where this workspace
				     lives, and how it gets somewhere else.

				     **Named for the two verbs it offers rather than for the question.** It read "move
				     this workspace", which describes neither button, and the row under it repeated
				     those same three words. Renamed 2026-08-21 at the human's direction. -->
				<Field.Legend>{$LL.workspace.groupTransfer()}</Field.Legend>
				<WorkspaceTransfer />
			</Field.Set>
		</Field.Group>
	</PageFrame>
{/if}
