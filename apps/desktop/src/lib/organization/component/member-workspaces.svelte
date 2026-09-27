<script lang="ts" module>
	import type { AccessSwitchRow } from '$lib/organization/component/access-switches.svelte';

	/**
	 * one workspace a member can be put in: what they hold on it today, and whether the reader
	 * holds it at full access themselves, which is what putting somebody in gives.
	 */
	export type MemberWorkspaceRow = AccessSwitchRow;
</script>

<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice } from '$lib/organization/component/access-dialog.svelte';
	import AccessSwitches from '$lib/organization/component/access-switches.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import BuildingIcon from '@lucide/svelte/icons/building';

	/**
	 * The workspaces a member is in, as one switch each (effort 838, requirement 12 as amended
	 * again 2026-09-27, the human's call on the running application).
	 *
	 * **A workspace is in or out**, with the owner's lock to read only beneath one that is in, as
	 * `access-switches.svelte` draws every grant; the workspace's own dialog draws its people from
	 * the same list. So the card reads as the member's role and the places they can open, and not
	 * as a second set of permissions beside the role. *Each workspace was a row of three levels,
	 * full access, read only and no access, until the human saw it beside the switch list and read
	 * it as a second permission system.*
	 *
	 * **The glyph is the workspaces section's building** ([[rules/frontend]]: a concept keeps one
	 * glyph everywhere it appears), and this is the section of the card around the list: its head,
	 * what stands in it with no workspace, and what the grants were refused with.
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
		refusal = null,
		disabled,
		error = null
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** what each row's switch is named by: `<rowPrefix>-<workspace id>`, and its lock `-lock`. */
		rowPrefix: string;
		/** the one sentence under the section's name, which is the moment's own. */
		description: string;
		/** what stands in the section when there is no workspace to hold. */
		empty: string;
		/** every workspace a grant can be held on, with what the member holds on it today. */
		rows: MemberWorkspaceRow[];
		/** the level chosen per workspace, where it differs from the row's own. */
		access: Record<string, AccessChoice>;
		onPick: (id: string, value: AccessChoice) => void;
		/** whether the reader is the owner, which is who mints a read only credential. */
		canGrantReadOnly: boolean;
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the grants were refused with, or `null`. */
		error?: string | null;
	} = $props();
</script>

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="workspaces">
	<MemberSectionHead {id} legend={$LL.settings.section.workspaces()} {description} />

	{#if rows.length === 0}
		<Field.Description data-access-empty>{empty}</Field.Description>
	{/if}

	<AccessSwitches
		{rowPrefix}
		{rows}
		{access}
		{onPick}
		{canGrantReadOnly}
		icon={BuildingIcon}
		lockLabel={(row) => $LL.organization.workspaceSwitches.lockNamed({ workspace: row.name })}
		{refusal}
		{disabled}
	/>

	{#if error}
		<Field.Error data-sheet-error="workspaces">{error}</Field.Error>
	{/if}
</Field.Set>
