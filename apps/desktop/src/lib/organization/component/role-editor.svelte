<script lang="ts" module>
	/** what the editor hands back on a save: the name, where it is the organization's to set, and the mask. */
	export type RoleEdit = { name: string; mask: number };
</script>

<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import { EDITABLE_FAMILIES, familyName, flagName, roleNameOf } from '$lib/organization/role';
	import type { OrganizationRole } from '$lib/platform/host';
	import { BUILT_IN, FAMILIES, maskOf, permits, xorOf } from '@rentable/workspace-permission';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import ShieldIcon from '@lucide/svelte/icons/shield';

	/**
	 * One role: what it is called and what everybody holding it may do (effort 838, requirements 4
	 * and 12). It makes a role and edits one.
	 *
	 * **Heavy: the edge panel, a tray on top and the records below** ([[rules/interface]], *Form
	 * surface*), the shape a member's sheet has. The tray is the role's name, the one fact about
	 * the whole role; the records are its flags, one list per family, in the order the roles list
	 * reads them. The owner's own family is not offered: no role can carry one of its flags.
	 *
	 * **The manager's and the member's names are the interface's**, said in the reader's language,
	 * so the tray reads the name and says why it stays rather than offering a field Rust refuses.
	 *
	 * **A flag the reader does not hold is theirs neither to give nor to take** (requirement 7), so
	 * its box is drawn refused, with the reason on its row, rather than left out: the role still
	 * carries it or not, and the reader should see which.
	 *
	 * **A new role opens on what a member carries**, since a role is usually a member with a little
	 * more or a little less, and it goes in just above the member; its card moves it from there.
	 *
	 * **The mutations are the caller's.** This owns the surface and what is chosen on it.
	 */
	let {
		open,
		onOpenChange,
		role,
		readerPermissions,
		isSaving,
		nameRefusal,
		flagsRefusal,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the role edited, or `null` for one not made yet. */
		role: OrganizationRole | null;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		readerPermissions: number;
		isSaving: boolean;
		/** what the name was refused with, or `null`. */
		nameRefusal: string | null;
		/** what the flags were refused with, or `null`. */
		flagsRefusal: string | null;
		onSave: (edit: RoleEdit) => void;
	} = $props();

	let chosenName = $state('');
	let nameInvalid = $state<string | null>(null);
	let mask = $state(0);

	// a fresh open starts on what the role holds, or on a member's flags for a new one.
	$effect(() => {
		if (open) {
			chosenName = role?.kind === 'custom' ? role.name : '';
			nameInvalid = null;
			mask = role?.mask ?? BUILT_IN.member.mask;
		}
	});

	const named = $derived(role === null || role.kind === 'custom');
	const nameError = $derived(nameInvalid ?? nameRefusal);

	const enhance = onSubmit(() => {
		if (isSaving) return;

		const name = chosenName.trim();

		if (named && name.length === 0) {
			nameInvalid = $LL.common.refusals.host.roleNameMissing();

			return;
		}

		onSave({ name, mask });
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={role ? $LL.common.actions.edit() : $LL.organization.roleList.newTitle()}
	description={role
		? $LL.organization.roleList.editDescription({ role: roleNameOf($LL, role) })
		: $LL.organization.roleList.newDescription()}
>
	<div class="flex flex-col gap-6" data-role-editor>
		<Field.Set class="gap-3" aria-labelledby="role-name-legend" data-sheet-section="name">
			<div
				data-sheet-tray="role-name-tray"
				class="flex flex-col gap-2 rounded-2xl bg-muted/30 px-3 py-2.5"
			>
				<Field.Legend id="role-name-legend" variant="label" class="mb-0">
					{$LL.organization.roleList.name()}
				</Field.Legend>

				{#if named}
					<InputGroup.Root class={insetControl} data-disabled={isSaving || undefined}>
						<InputGroup.Addon>
							<ShieldIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							name="role-name"
							autocomplete="off"
							aria-labelledby="role-name-legend"
							bind:value={chosenName}
							placeholder={$LL.organization.roleList.name()}
							disabled={isSaving}
							aria-invalid={nameError ? 'true' : undefined}
						/>
					</InputGroup.Root>
					<Field.Description>{$LL.organization.roleList.nameDescription()}</Field.Description>
				{:else if role}
					<p class="text-sm font-medium first-letter:uppercase" data-role-fixed-name>
						{roleNameOf($LL, role)}
					</p>
					<Field.Description>{$LL.organization.roleList.builtInName()}</Field.Description>
				{/if}
			</div>

			{#if nameError}
				<Field.Error data-sheet-error="name">{nameError}</Field.Error>
			{/if}
		</Field.Set>

		<Field.Set class="gap-3" aria-labelledby="role-flags-legend" data-sheet-section="flags">
			<MemberSectionHead
				id="role-flags"
				legend={$LL.organization.roleList.flagsTitle()}
				description={$LL.organization.roleList.flagsDescription()}
			/>

			{#each EDITABLE_FAMILIES as family (family)}
				<Field.Set class="gap-1.5" data-role-family={family}>
					<Field.Legend variant="label" class="mb-0 text-xs text-muted-foreground">
						{familyName($LL, family)}
					</Field.Legend>

					{#each FAMILIES[family] as flag (flag)}
						{@const notHeld = !permits(readerPermissions, flag)}
						<Field.Field orientation="horizontal" class="gap-2" data-role-flag={flag}>
							<Checkbox
								id={`role-flag-${flag}`}
								checked={permits(mask, flag)}
								disabled={isSaving || notHeld}
								aria-describedby={notHeld ? `role-flag-${flag}-reason` : undefined}
								onCheckedChange={() => {
									mask = xorOf(mask, maskOf(flag));
								}}
							/>
							<div class="flex min-w-0 flex-col">
								<Field.Label for={`role-flag-${flag}`} class="font-normal">
									{flagName($LL, flag)}
								</Field.Label>
								{#if notHeld}
									<span
										id={`role-flag-${flag}-reason`}
										class="text-xs text-muted-foreground"
										data-role-flag-reason={flag}
									>
										{$LL.organization.dashboard.notHeld()}
									</span>
								{/if}
							</div>
						</Field.Field>
					{/each}
				</Field.Set>
			{/each}

			{#if flagsRefusal}
				<Field.Error data-sheet-error="flags">{flagsRefusal}</Field.Error>
			{/if}
		</Field.Set>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving} data-role-save>
			{#if role}
				<SaveIcon class="size-4" />
				{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
			{:else}
				<PlusIcon class="size-4" />
				{isSaving ? $LL.common.actions.working() : $LL.organization.roleList.create()}
			{/if}
		</Button>
	{/snippet}
</FormSurface>
