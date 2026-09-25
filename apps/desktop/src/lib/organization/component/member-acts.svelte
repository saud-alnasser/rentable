<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import { maskOf, permits, type Administration } from '@rentable/workspace-permission';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * What a member may do beyond their role: a plain list of what they were widened by, with a
	 * control that takes one back and one that opens a chooser of the rest.
	 *
	 * **Shared by the sheet that adds a member and the sheet that edits one** (ticket 42 of effort
	 * 832). The sheet that adds one drew seven checkboxes under a heading of its own, most of them
	 * already on for an administrator, which is what the human asked the edit sheet to be rid of;
	 * one list now serves both moments. It is drawn for a member alone: an administrator holds
	 * every act from the moment they are created, and the role's tray says so in its place.
	 *
	 * **The widening is an additive list, not a wall of toggles.** One plain sentence per act, in
	 * the order they read, the ones about people before the ones about workspaces. *They were
	 * drawn under two headings until the human said it read as a second permissions form.*
	 *
	 * **Giving somebody an act that signs a row is the owner's alone**, because only the owner's
	 * vault derives the key that certifies a signer. Six of the seven acts sign; `renameWorkspace`
	 * writes the sealed name outside the signature and is the one that does not. So a reader who is
	 * not the owner is offered the signing acts nowhere: the chooser leaves out what it cannot hand
	 * over, and the absence is the whole of what needs saying. Narrowing is still theirs, so every
	 * act held keeps its remove. *The list of what signs is stated here and in
	 * `organization/permission.rs`; the package carries the acts and not which of them signs.*
	 *
	 * **Nothing is written from here.** The confirm puts the acts on the list and the sheet's own
	 * submit is what writes the column.
	 */
	let {
		id,
		chosen = $bindable(),
		canGrantSigning,
		disabled,
		error = null
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** the permission value the member is to carry. */
		chosen: number;
		/** whether the reader is the owner, which is who may hand out an act that signs a row. */
		canGrantSigning: boolean;
		disabled: boolean;
		/** what the acts were refused with, or `null`. */
		error?: string | null;
	} = $props();

	/**
	 * the one act of the seven that signs nothing: `renameWorkspace` writes the sealed workspace
	 * name outside the signature, so a member holding it needs no certificate and any holder of
	 * `changeRole` can hand it out.
	 */
	const SIGNS_NOTHING: Administration = 'renameWorkspace';

	/** the seven acts in the order they read, the ones about people before the ones about workspaces. */
	const IN_ORDER: Administration[] = [
		'inviteMember',
		'removeMember',
		'renameMember',
		'resetPassword',
		'changeRole',
		'renameWorkspace',
		'grantWorkspace'
	];

	const actDoes = (act: Administration) =>
		({
			inviteMember: $LL.organization.acts.inviteMember.does(),
			removeMember: $LL.organization.acts.removeMember.does(),
			changeRole: $LL.organization.acts.changeRole.does(),
			renameWorkspace: $LL.organization.acts.renameWorkspace.does(),
			resetPassword: $LL.organization.acts.resetPassword.does(),
			renameMember: $LL.organization.acts.renameMember.does(),
			grantWorkspace: $LL.organization.acts.grantWorkspace.does()
		})[act];

	const held = $derived(IN_ORDER.filter((act) => permits(chosen, act)));

	/**
	 * the acts the picker offers: what this member does not hold, less what this reader cannot
	 * hand over. A signing act is the owner's to give, so for anybody else it is not in the picker
	 * at all, and there is nothing to explain about a control that is not there.
	 */
	const addable = $derived(
		IN_ORDER.filter((act) => !permits(chosen, act) && (canGrantSigning || act === SIGNS_NOTHING))
	);

	/** the picker, and what is ticked in it. Nothing is allowed until the one confirm is pressed. */
	let picking = $state(false);
	let ticked = $state<Administration[]>([]);

	const tick = (act: Administration, on: boolean) => {
		ticked = on ? [...ticked, act] : ticked.filter((other) => other !== act);
	};

	const add = (act: Administration) => {
		if (!permits(chosen, act)) chosen = chosen + maskOf(act);
	};

	const drop = (act: Administration) => {
		if (permits(chosen, act)) chosen = chosen - maskOf(act);
	};

	/**
	 * allow everything ticked, in one act.
	 *
	 * **One confirm rather than one press per act.** Widening somebody usually means two or three
	 * acts at once, and a picker that closed on each one made the person open it again for the
	 * next; the human said as much.
	 */
	const allow = () => {
		for (const act of ticked) add(act);

		ticked = [];
		picking = false;
	};
</script>

<!--
	the picker: everything this member is not allowed yet, ticked and then allowed in one press.
	What this reader may not hand over is absent, not drawn refused: a control that cannot change
	anything is noise on a picker whose whole point is what can be added.
-->
{#snippet allowActs()}
	<Popover.Root
		bind:open={
			() => picking,
			(value) => {
				picking = value;
				if (!value) ticked = [];
			}
		}
	>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="outline"
					size="icon-sm"
					data-act-add
					aria-label={$LL.organization.dashboard.beyondRoleAdd()}
					{disabled}
				>
					<PlusIcon />
				</Button>
			{/snippet}
		</Popover.Trigger>

		<Popover.Content align="end" class="w-80 p-3" data-act-picker>
			<div class="flex flex-col gap-3">
				<div class="flex flex-col gap-2">
					{#each addable as act (act)}
						<Field.Field orientation="horizontal" class="gap-2" data-act-offer={act}>
							<Checkbox
								id={`${id}-allow-${act}`}
								checked={ticked.includes(act)}
								onCheckedChange={(state) => tick(act, state === true)}
							/>
							<Field.Label for={`${id}-allow-${act}`} class="flex-1 font-normal">
								{actDoes(act)}
							</Field.Label>
						</Field.Field>
					{/each}
				</div>

				<Button
					type="button"
					size="sm"
					class="w-full"
					data-act-allow
					disabled={ticked.length === 0}
					onclick={allow}
				>
					{$LL.organization.dashboard.allowActs()}
				</Button>
			</div>
		</Popover.Content>
	</Popover.Root>
{/snippet}

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="acts">
	<MemberSectionHead
		{id}
		legend={$LL.organization.dashboard.beyondRole()}
		description={$LL.organization.dashboard.beyondRoleDescription()}
		control={addable.length > 0 ? allowActs : null}
	/>

	<!-- a plain list, one line per act: at most seven short lines, so nothing here is boxed, ruled
	     or grouped. The x is quiet and sits at the end of its own line, the way an exception is
	     taken off a list. -->
	{#if held.length === 0}
		<p class="text-sm text-muted-foreground" data-acts-none>
			{$LL.organization.dashboard.beyondRoleNone()}
		</p>
	{:else}
		<ul class="flex flex-col gap-1">
			{#each held as act (act)}
				<li class="flex items-center gap-2" data-act={act}>
					<span class="flex-1 text-sm leading-snug" data-act-says={act}>
						{actDoes(act)}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="icon-xs"
						class="shrink-0 text-muted-foreground"
						data-act-remove={act}
						{disabled}
						onclick={() => drop(act)}
					>
						<XIcon />
						<span class="sr-only">{$LL.common.actions.remove()} {actDoes(act)}</span>
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if error}
		<Field.Error data-sheet-error="acts">{error}</Field.Error>
	{/if}
</Field.Set>
