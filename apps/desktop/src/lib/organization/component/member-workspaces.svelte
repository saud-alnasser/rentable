<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice, AccessRow } from '$lib/organization/component/access-dialog.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';

	/**
	 * The workspaces a member holds: one record per workspace, with what they hold on it in words
	 * and the control that changes it.
	 *
	 * **Shared by the sheet that adds a member and the sheet that edits one** (ticket 42 of effort
	 * 832). Every workspace is a row with three levels, and *no access* is what not granting it
	 * is: the sheet that adds a member starts every row there, and hands up a grant for each row
	 * that left it. *The sheet that adds one drew a checkbox per workspace with a control of two
	 * levels beside it, waiting for the box; the human saw the two sheets side by side and asked
	 * for one layout.*
	 *
	 * **Read only is the owner's**, because minting a read only credential needs the Turso
	 * authority on the owner's machine. For anybody else it is drawn refused rather than hidden,
	 * with the sentence naming the owner; Rust refuses it again. A row that already holds read only
	 * keeps saying so: what is refused is granting it, not reading it.
	 */
	let {
		id,
		rowPrefix,
		description,
		empty,
		rows,
		access,
		onPick,
		canGrantReadOnly,
		disabled,
		error = null
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** what each row's control is named by: `<rowPrefix>-<workspace id>`. */
		rowPrefix: string;
		/** the one sentence under the section's name, which is the moment's own. */
		description: string;
		/** what stands in the section when there is no workspace to hold. */
		empty: string;
		/** every workspace a grant can be held on, with what the member holds on it today. */
		rows: AccessRow[];
		/** the level chosen per workspace, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/** whether the reader is the owner, which is who mints a read only credential. */
		canGrantReadOnly: boolean;
		disabled: boolean;
		/** what the grants were refused with, or `null`. */
		error?: string | null;
	} = $props();

	/** the three levels a grant can be held at, fullest first. */
	const LEVELS: AccessChoice[] = ['full-access', 'read-only', 'none'];

	const accessLabel = (value: AccessChoice) =>
		({
			none: $LL.organization.dashboard.accessNone(),
			'full-access': $LL.organization.dashboard.accessFull(),
			'read-only': $LL.organization.dashboard.accessReadOnly()
		})[value];

	const accessDoes = (value: AccessChoice) =>
		({
			none: $LL.organization.levels.none.does(),
			'full-access': $LL.organization.levels.full.does(),
			'read-only': $LL.organization.levels.readOnly.does()
		})[value];

	const pick = (row: string, value: string) => {
		if (value === 'none' || value === 'full-access' || value === 'read-only') onPick(row, value);
	};
</script>

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="workspaces">
	<MemberSectionHead {id} legend={$LL.settings.section.workspaces()} {description} />

	{#if rows.length === 0}
		<Field.Description data-access-empty>{empty}</Field.Description>
	{/if}

	{#each rows as row (row.id)}
		{@const level = access[row.id] ?? row.access}
		<!-- a record of this list: the workspace, what they hold on it in words, and the control
		     that changes it. -->
		<div
			class="flex flex-col gap-2 rounded-2xl px-3 py-2 ring-1 ring-foreground/5"
			data-access-row={row.id}
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<Field.Label id={`${rowPrefix}-${row.id}-label`} class="min-w-0 truncate">
					{row.name}
				</Field.Label>

				<!-- each level named on its own segment, and read only drawn refused rather than
				     absent for anybody but the owner, because the access exists and who mints it is
				     worth saying. -->
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					class="w-full shrink-0 sm:w-auto"
					id={`${rowPrefix}-${row.id}`}
					aria-labelledby={`${rowPrefix}-${row.id}-label`}
					bind:value={() => level, (value) => pick(row.id, value)}
					{disabled}
				>
					{#each LEVELS as offered (offered)}
						<ToggleGroup.Item
							value={offered}
							class="flex-1"
							data-level={offered}
							disabled={offered === 'read-only' && !canGrantReadOnly && row.access !== 'read-only'}
						>
							{accessLabel(offered)}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>

			<!-- what the level chosen is good for, under the control: that sentence is the fact a
			     person chooses on, and a segment has no room for one of its own. -->
			<span class="block text-xs leading-snug text-muted-foreground" data-access-says={row.id}>
				{accessDoes(level)}
			</span>
		</div>
	{/each}

	{#if !canGrantReadOnly && rows.length > 0}
		<Field.Description data-access-refusal>
			{$LL.organization.dashboard.readOnlyIsTheOwners()}
		</Field.Description>
	{/if}

	{#if error}
		<Field.Error data-sheet-error="workspaces">{error}</Field.Error>
	{/if}
</Field.Set>
