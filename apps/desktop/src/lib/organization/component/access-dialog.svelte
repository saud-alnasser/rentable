<script lang="ts" module>
	/** what one grant is good for, or that there is none. */
	export type AccessChoice = 'none' | 'full-access' | 'read-only';

	/** one thing a grant can be held on, with the access held on it today. */
	export type AccessRow = { id: string; name: string; access: AccessChoice };
</script>

<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import AccessSwitches, {
		type AccessSwitchRow
	} from '$lib/organization/component/access-switches.svelte';
	import KeyIcon from '@lucide/svelte/icons/key-round';
	import UserIcon from '@lucide/svelte/icons/user';

	/**
	 * Who holds a workspace, one switch per member: in or out, and the owner's lock to read only
	 * beneath one who is in (effort 838, requirement 12 as amended again 2026-09-27; ticket 49).
	 *
	 * **Light: a list of switches under one save** ([[rules/interface]], *Form surface*). Opened
	 * from a workspace's card in the workspaces section, where the rows are the people who could
	 * hold it and the subject is the workspace, named by the caller through `title` and
	 * `description`.
	 *
	 * **It draws a grant as a member's card does** (`access-switches.svelte`), read from the
	 * other end: the card lists the workspaces a member is in, this lists the people a workspace
	 * has, and the switches, their refusals and their reasons are the one list's. The glyph is the
	 * member's person, the one their sheet leads with. *It offered full access, read only and no
	 * access per member, as a toggle group of three, until the card's switches made those words
	 * the ones the human had retired.*
	 *
	 * **The refusals are the list's own.** Putting somebody in is the reader's full-access
	 * credential re-sealed, so a reader holding this workspace read only may take people out and
	 * put nobody in; the lock is the owner's, because minting a read-only credential needs the
	 * Turso authority on the owner's machine (requirement 5), drawn dimmed with the reason for
	 * anybody else, and a lock already on stays drawn on. Rust refuses both again. Who is listed
	 * is the caller's: never the owner, whose grant is never withdrawn, and never the reader, who
	 * does not write their own row. The dialog opens only for a reader holding `grantWorkspace`.
	 *
	 * **Taking a grant back mints nothing**, so the credential the member already holds works
	 * until it expires. Cutting somebody off at once is the lock-out on a removal, and that is the
	 * owner's.
	 *
	 * **The mutation is the caller's.** This owns the surface and what is chosen on it, and hands
	 * the rows that changed up through `onSave`, by their own ids.
	 */
	let {
		open,
		onOpenChange,
		title,
		description,
		rows,
		canGrantReadOnly,
		isSaving,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** what is being granted over, in the caller's words. */
		title: string;
		description: string;
		/**
		 * every member a grant can be held by, with what each holds today, and whether the reader
		 * holds the workspace at full access, which is what putting somebody in gives.
		 */
		rows: AccessSwitchRow[];
		/** whether the reader is the owner, which is who mints a read-only credential. */
		canGrantReadOnly: boolean;
		isSaving: boolean;
		/** the rows whose access changed, and what each one should become. */
		onSave: (changes: { id: string; access: AccessChoice }[]) => void;
	} = $props();

	let chosen = $state<Record<string, AccessChoice>>({});

	// a fresh open starts on what the rows hold, with nothing left over from the last subject.
	$effect(() => {
		if (open) {
			chosen = Object.fromEntries(rows.map((row) => [row.id, row.access]));
		}
	});

	const pick = (id: string, value: AccessChoice) => {
		chosen[id] = value;
	};

	const enhance = onSubmit(() => {
		if (isSaving) return;

		onSave(
			rows
				.filter((row) => (chosen[row.id] ?? row.access) !== row.access)
				.map((row) => ({ id: row.id, access: chosen[row.id] ?? row.access }))
		);
	});
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="light" {title} {description}>
	<div class="flex flex-col gap-3" data-access-form>
		{#if rows.length === 0}
			<Field.Description data-access-empty>
				{$LL.organization.dashboard.noWorkspaces()}
			</Field.Description>
		{/if}

		<AccessSwitches
			rowPrefix="access"
			{rows}
			access={chosen}
			onPick={pick}
			{canGrantReadOnly}
			icon={UserIcon}
			lockLabel={(row) => $LL.organization.workspaceSwitches.lockMemberNamed({ member: row.name })}
			disabled={isSaving}
		/>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving}>
			<KeyIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
