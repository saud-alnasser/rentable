<script lang="ts">
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { onSubmit } from '$lib/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { WorkspaceTailoring as Tailoring } from '$lib/organization/access/access';
	import WorkspaceTailoring from '$lib/organization/access/component/tailoring.svelte';
	import SaveIcon from '@lucide/svelte/icons/save';

	/**
	 * What one member may do in one workspace, and nothing else (effort 846, ticket 51, at the
	 * human's word of 2026-10-03: "the edit permissions is a sheet with the permissions for this
	 * workspace only swtiches to edit and it sayss it is an override on the org and role pemirsisons
	 * for this workspace").
	 *
	 * **Heavy: the edge panel** ([[rules/interface]], *Form surface*), the weight a member's own
	 * sheet declares, since this is a part of it seen from the workspace's end. Its description says
	 * whose permissions these are and that they override the organization's and the role's here.
	 *
	 * **The switches are the member card's for this workspace** (`access/component/tailoring.svelte`,
	 * standing open rather than folded), so what is set is what differs from what the member holds
	 * across the organization, each switch the reader may not turn says why, and a grant minted read
	 * only lifts as it does there. Where the reader may change nothing (`refusal`) every switch is
	 * dimmed with the reason once above them.
	 *
	 * **The writes are the caller's.** This holds what the switches come to and hands it up through
	 * `onSave`; what the shell refused stands under the switches (`error`).
	 */
	let {
		open,
		onOpenChange,
		username,
		workspaceId,
		workspaceName,
		organizationWide,
		held,
		readerPermissions,
		refusal = null,
		regrantRefusal = null,
		isSaving,
		error = null,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the member whose permissions these are. */
		username: string;
		/** the workspace they are set in, which names the switches in the document. */
		workspaceId: string;
		/** the workspace's name, which the description says. */
		workspaceName: string;
		/** what the member may do across the organization. */
		organizationWide: number;
		/** what the workspace holds for them now: the grant's level and what is set there. */
		held: Tailoring;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		readerPermissions: number;
		/** why the reader may change nothing here, or `null` where they may. */
		refusal?: string | null;
		/** why re-granting the workspace at full access would be refused, or `null`. */
		regrantRefusal?: string | null;
		isSaving: boolean;
		/** what the shell refused the save with, or `null`. */
		error?: string | null;
		onSave: (next: Tailoring) => void;
	} = $props();

	let value = $state<Tailoring>({ access: 'full-access', pinned: 0, granted: 0 });

	// a fresh open starts on what the workspace holds for the member.
	$effect(() => {
		if (open) value = { ...held };
	});

	const enhance = onSubmit(() => {
		if (isSaving) return;

		onSave(value);
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.workspacePage.editPermissions()}
	description={`${$LL.organization.workspacePage.permissionsOf({ username })} ${$LL.organization.workspacePage.permissionsOverride({ workspace: workspaceName })}`}
>
	<div class="flex flex-col gap-3" data-holder-permissions>
		<WorkspaceTailoring
			id={`holder-${workspaceId}-permissions`}
			{organizationWide}
			{held}
			{value}
			onChange={(next) => {
				value = next;
			}}
			{readerPermissions}
			{refusal}
			{regrantRefusal}
			folded={false}
			disabled={isSaving}
		/>

		{#if error}
			<Field.Error data-holder-permissions-error>{error}</Field.Error>
		{/if}
	</div>

	{#snippet actions({ requestClose })}
		<Button type="button" variant="outline" disabled={isSaving} onclick={requestClose}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving}>
			<SaveIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
