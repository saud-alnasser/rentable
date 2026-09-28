<script lang="ts" module>
	import type { AccessSwitchRow } from '$lib/organization/component/access-switches.svelte';

	/**
	 * one workspace a member can be put in: what they hold on it today, what is set for them there
	 * and at what value, and whether the reader holds it at full access themselves, which is what
	 * putting somebody in gives.
	 */
	export type MemberWorkspaceRow = AccessSwitchRow & { pinned: number; granted: number };
</script>

<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice } from '$lib/organization/component/access-dialog.svelte';
	import AccessSwitches from '$lib/organization/component/access-switches.svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import type { Snippet } from 'svelte';

	/**
	 * The workspaces a member is in, as one switch each (effort 838, requirement 12 as amended
	 * again, a third and a fourth time, the human's calls on the running application).
	 *
	 * **A workspace is its access switch, in or out**, as `access-switches.svelte` draws every
	 * grant; the workspace's own dialog draws its people from the same list. Beneath one that is
	 * in, the member's card folds the permissions they hold there (`beneath`,
	 * `workspace-tailoring.svelte`); the sheet that adds a member draws in and out alone. So the
	 * card reads as the member's role and the places they can open, and not as a second set of
	 * permissions beside the role. *Each workspace was a row of three levels, full access, read
	 * only and no access, until the human saw it beside the switch list and read it as a second
	 * permission system; then a switch with the owner's lock to read only beneath it, until read
	 * only became a preset of the tailoring, and the fourth amendment took the preset away.*
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
		refusal = null,
		disabled,
		error = null,
		beneath,
		legend
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** what each row's switch is named by: `<rowPrefix>-<workspace id>`. */
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
		/** why the reader may turn none of them, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the grants were refused with, or `null`. */
		error?: string | null;
		/** what is drawn beneath a workspace the member is in: the card's permissions there. */
		beneath?: Snippet<[AccessSwitchRow]>;
		/**
		 * the section's title, where it says more than *workspaces*: on both sheets a member has,
		 * it names the scope, the permissions each workspace carries.
		 */
		legend?: string;
	} = $props();
</script>

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="workspaces">
	<MemberSectionHead {id} legend={legend ?? $LL.settings.section.workspaces()} {description} />

	{#if rows.length === 0}
		<Field.Description data-access-empty>{empty}</Field.Description>
	{/if}

	<AccessSwitches
		{rowPrefix}
		{rows}
		{access}
		{onPick}
		icon={BuildingIcon}
		{refusal}
		{disabled}
		{beneath}
	/>

	{#if error}
		<Field.Error data-sheet-error="workspaces">{error}</Field.Error>
	{/if}
</Field.Set>
