<script lang="ts" module>
	import type { AccessSwitchRow } from '$lib/organization/component/access-switches.svelte';

	/** what one grant is good for, or that there is none. */
	export type AccessChoice = 'none' | 'full-access' | 'read-only';

	/**
	 * one thing a grant can be held on, with the access held on it today. `read-only` is a grant
	 * the owner minted before the lock left (effort 838, requirement 12 as amended a third time):
	 * it keeps working, and nothing here makes a new one.
	 */
	export type AccessRow = { id: string; name: string; access: AccessChoice };

	/** one member a workspace can be held by, and whether what they may do there is tailored. */
	export type AccessDialogRow = AccessSwitchRow & { tailored: boolean };
</script>

<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { onSubmit } from '$lib/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import AccessSwitches from '$lib/organization/component/access-switches.svelte';
	import { MEMBER_GLYPH } from '$lib/organization/glyph';
	import SaveIcon from '@lucide/svelte/icons/save';

	/**
	 * Who holds a workspace, one switch per member, in or out (effort 838, requirement 12 as
	 * amended again and a third time 2026-09-27; tickets 49 and 54).
	 *
	 * **Light: a list of switches under one save** ([[rules/interface]], *Form surface*). Opened
	 * from a workspace's card in the workspaces section, where the rows are the people who could
	 * hold it and the subject is the workspace, named by the caller through `title` and
	 * `description`.
	 *
	 * **It draws a grant as a member's card does** (`access-switches.svelte`), read from the
	 * other end: the card lists the workspaces a member is in, this lists the people a workspace
	 * has, and the switches, their refusals and their reasons are the one list's. The glyph is a
	 * member's (`MEMBER_GLYPH`), not the tenant's person. *It offered full access, read only and no
	 * access per member, as a toggle group of three, until the card's switches made those words
	 * the ones the human had retired.*
	 *
	 * **A person tailored here is marked** *custom here* beside their name: something is set for
	 * them in this workspace, or what they may do in it differs from what they may do across the
	 * organization. The tailoring itself
	 * is on their card, beneath this workspace, and not here. *The lock to read only sat beneath a
	 * person who was in until read only became a preset of that tailoring.*
	 *
	 * **The refusals are the list's own.** Putting somebody in is the reader's full-access
	 * credential re-sealed, so a reader holding this workspace read only may take people out and
	 * put nobody in, save back what somebody held, and Rust refuses that again. *A person whose
	 * grant the owner minted read only was the owner's to take out until review round one of the
	 * workspace layer.* Who is listed is the caller's:
	 * never the owner, whose grant is never withdrawn, and never the reader, who does not write
	 * their own row. The workspace card's act that opens this is refused, naming `grantWorkspace`,
	 * for a reader without it, as the member's card refuses its workspaces section, so the dialog
	 * opens only for a reader holding it.
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
		isSaving,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** what is being granted over, in the caller's words. */
		title: string;
		description: string;
		/**
		 * every member a grant can be held by, with what each holds today, whether what they may
		 * do there is tailored, and whether the reader holds the workspace at full access, which is
		 * what putting somebody in gives.
		 */
		rows: AccessDialogRow[];
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
				{$LL.organization.dashboard.noMemberToGrant()}
			</Field.Description>
		{/if}

		<AccessSwitches
			rowPrefix="access"
			{rows}
			access={chosen}
			onPick={pick}
			icon={MEMBER_GLYPH}
			markOf={(row) =>
				rows.find((each) => each.id === row.id)?.tailored &&
				(chosen[row.id] ?? row.access) !== 'none'
					? $LL.organization.workspaceSwitches.customHere()
					: null}
			disabled={isSaving}
		/>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- save's glyph before its label, as the member's sheet and the role editor carry it. -->
		<Button type="submit" disabled={isSaving}>
			<SaveIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
