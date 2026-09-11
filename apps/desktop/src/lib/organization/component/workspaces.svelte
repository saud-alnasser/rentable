<script lang="ts">
	import type { OrganizationWorkspace } from '$lib/platform/tauri';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * The workspaces the signed-in member holds a grant on, and the way to add one.
	 *
	 * **The form is drawn for the owner and a sentence for everybody else**, for the reason the
	 * no-workspace surface gives: creating a workspace needs the Turso authority only the owner's
	 * machine holds, and the shell refuses anybody else at the command regardless. An
	 * administrator sees the same list and the sentence, so they know whom to ask.
	 */
	let {
		workspaces,
		canCreate,
		isCreating,
		onCreate
	}: {
		workspaces: OrganizationWorkspace[];
		/** whether the person is the owner, which is who a create is for. */
		canCreate: boolean;
		isCreating: boolean;
		onCreate: (name: string) => void;
	} = $props();

	let name = $state('');

	const canSubmit = $derived(canCreate && name.trim().length > 0 && !isCreating);

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
		<form
			class="flex flex-col gap-2 sm:flex-row sm:items-end"
			data-workspace-form
			onsubmit={(event) => {
				event.preventDefault();

				if (!canSubmit) return;

				onCreate(name.trim());
				name = '';
			}}
		>
			<Field.Field class="min-w-0 flex-1">
				<Field.Label for="dashboard-workspace-name"
					>{$LL.layout.noWorkspace.nameLabel()}</Field.Label
				>
				<Input
					id="dashboard-workspace-name"
					name="name"
					bind:value={name}
					placeholder={$LL.layout.noWorkspace.nameLabel()}
					disabled={isCreating}
				/>
			</Field.Field>

			<Button type="submit" class="shrink-0" disabled={!canSubmit}>
				{isCreating ? $LL.common.actions.working() : $LL.layout.noWorkspace.create()}
			</Button>
		</form>
	{:else}
		<p class="text-sm text-muted-foreground" data-workspace-owner-only>
			{$LL.layout.noWorkspace.ownerOnly()}
		</p>
	{/if}
</div>
