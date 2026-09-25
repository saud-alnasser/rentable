<script lang="ts">
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * A member's role, in the tray a member's sheet opens with: the one choice about the whole
	 * person, with the sentence that role means under it.
	 *
	 * **Shared by the sheet that adds a member and the sheet that edits one** (ticket 42 of effort
	 * 832), so the role is the same tray, the same legend and the same control in both moments.
	 * What each does with a pick is its own: both fill the acts in with what the role is created
	 * with, and leave them editable.
	 *
	 * **The tray is the directory's shape on a surface that is not a page** (the human's second
	 * look, effort 828). It is `organization/component/directory-tray.svelte` read twice over:
	 * that block hardcodes the page treatment its two sections want, a card-coloured bar with a
	 * `legend` sized for a section, and both are wrong inside a panel that is already
	 * card-coloured. Two props would close the gap, a `class` on the bar and the legend's
	 * `variant`; until something else wants them, the shape is three lines here rather than two
	 * presentation props on a block that draws a section head.
	 *
	 * **A role is described by who it is for** (`organization.roles.<role>.who`), which is what
	 * every product in
	 * [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/how-products-present-roles-and-permissions]]
	 * does and what lets the chooser stand on its own. The sentence
	 * under the control is the role chosen now, not a list of the two: what the other means is said
	 * the moment it is pressed. The owner's role is never offered: ownership moves a key and two
	 * rows, so it is handed over by its own act on the owner's own card.
	 *
	 * **An administrator is the owner's to make.** An administrator is created holding every act
	 * and six of them sign a row, so for anybody but the owner the role is drawn refused rather
	 * than hidden, and a sentence under the tray says whose it is.
	 */
	let {
		id,
		value,
		onPick,
		canMakeAdministrator,
		disabled,
		error = null
	}: {
		/** the control's id; the tray is `<id>-tray` and its legend `<id>-tray-legend`. */
		id: string;
		value: 'administrator' | 'member';
		onPick: (value: 'administrator' | 'member') => void;
		/** whether the reader is the owner, who alone makes an administrator. */
		canMakeAdministrator: boolean;
		disabled: boolean;
		/** what the role was refused with, or `null`. */
		error?: string | null;
	} = $props();

	/** the two roles a sheet writes, in the order they are offered. The owner's is never one. */
	const ROLES = ['member', 'administrator'] as const;

	const roleLabel = (role: string) =>
		({
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[role] ?? role;

	const roleWho = (role: string) =>
		({
			administrator: $LL.organization.roles.administrator.who(),
			member: $LL.organization.roles.member.who()
		})[role] ?? '';

	// pressing the one already chosen would unset a single group, and a member always holds a
	// role, so the setter leaves that alone.
	const pick = (next: string) => {
		if (next === 'administrator' || next === 'member') onPick(next);
	};
</script>

<Field.Set class="gap-3" aria-labelledby={`${id}-tray-legend`} data-sheet-section="role">
	<div
		data-sheet-tray={`${id}-tray`}
		class="flex flex-col gap-2 rounded-2xl bg-muted/30 px-3 py-2.5"
	>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<Field.Legend id={`${id}-tray-legend`} variant="label" class="mb-0">
				{$LL.organization.dashboard.role()}
			</Field.Legend>

			<!-- the two roles side by side, as a choice of two is ([[rules/interface]], *Field
			     kinds*). -->
			<div class="flex shrink-0 items-center gap-3">
				<ToggleGroup.Root
					type="single"
					variant="outline"
					{id}
					aria-labelledby={`${id}-tray-legend`}
					class="w-full sm:w-auto"
					bind:value={() => value, pick}
					{disabled}
				>
					{#each ROLES as role (role)}
						<ToggleGroup.Item
							value={role}
							class="flex-1 capitalize"
							data-role={role}
							disabled={role === 'administrator' && !canMakeAdministrator}
						>
							{roleLabel(role)}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</div>
		</div>

		<!-- under the control, and about what it holds now: a segmented control has no room for a
		     sentence per option, so the one chosen is the one said. -->
		<Field.Description>{roleWho(value)}</Field.Description>
	</div>

	{#if !canMakeAdministrator}
		<Field.Description data-role-refusal>
			{$LL.organization.dashboard.administratorsAreTheOwners()}
		</Field.Description>
	{/if}

	<!-- an administrator holds every act already, so the list of what else they may do has
	     nothing to allow or take away and one line stands in its place. -->
	{#if value === 'administrator'}
		<Field.Description data-acts-every>
			{$LL.organization.dashboard.administratorAllowedEvery()}
		</Field.Description>
	{/if}

	{#if error}
		<Field.Error data-sheet-error="role">{error}</Field.Error>
	{/if}
</Field.Set>
