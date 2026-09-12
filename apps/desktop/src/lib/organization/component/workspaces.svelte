<script lang="ts">
	import type { OrganizationWorkspace } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/**
	 * The workspaces the signed-in member holds a grant on, and the way to add one.
	 *
	 * **The list, and an opener.** The form that names a new workspace is the shared form surface,
	 * mounted once in the shell (`organization/dialogs.svelte.ts` says why once); what this
	 * section holds is the control that opens it, drawn for whoever may create, and for everybody
	 * else the sentence the page composes, the same one the rail's row says for the same person:
	 * creating a workspace needs the Turso authority only the owner's machine holds, and the shell
	 * refuses anybody else at the command regardless. An administrator reads that the owner
	 * creates; an owner restored on a machine without the authority reads that the account must be
	 * reconnected. The list draws and never decides. *The no-workspace surface's sentence stood
	 * here first; it speaks of the first workspace, and under a list that already holds some it
	 * read as a contradiction.*
	 */
	let {
		workspaces,
		canCreate,
		refusal
	}: {
		workspaces: OrganizationWorkspace[];
		/** whether this person, on this machine, may create: the owner holding the authority. */
		canCreate: boolean;
		/** why not, composed by the page from the locale; `null` where `canCreate`. */
		refusal: string | null;
	} = $props();

	const accessLabel = (level: string) =>
		({
			'full-access': $LL.organization.dashboard.accessFull(),
			'read-only': $LL.organization.dashboard.accessReadOnly()
		})[level] ?? level;
</script>

<div class="space-y-4" data-workspaces>
	{#if workspaces.length === 0}
		<p class="text-sm text-muted-foreground">{$LL.organization.dashboard.noWorkspaces()}</p>
	{/if}

	{#each workspaces as workspace (workspace.id)}
		<Field.Field orientation="responsive" data-workspace={workspace.id}>
			<Field.Content>
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<p class="truncate text-sm font-medium">{workspace.name}</p>
					<Badge variant="secondary">{accessLabel(workspace.accessLevel)}</Badge>
				</div>
				<!-- a machine string, read left to right in both locales ([[rules/frontend]], *i18n*). -->
				<Field.Description>
					<span dir="ltr">{workspace.databaseHostname}</span>
				</Field.Description>
			</Field.Content>
		</Field.Field>
	{/each}

	{#if canCreate}
		<div>
			<!-- the verb's glyph before its label, as every primary here carries one. -->
			<Button
				type="button"
				data-workspace-create
				onclick={() => openOrganizationDialog('workspace')}
			>
				<PlusIcon class="size-4" />
				{$LL.layout.workspaceMenu.create()}
			</Button>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground" data-workspace-owner-only>{refusal}</p>
	{/if}
</div>
