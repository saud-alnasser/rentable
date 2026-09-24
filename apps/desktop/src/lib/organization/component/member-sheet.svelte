<script lang="ts" module>
	/** what the sheet hands back on a save: the name, the role, the acts, and the grants that changed. */
	export type MemberEdit = {
		/** the username, trimmed; the one they hold where the reader may not rename them. */
		username: string;
		role: 'administrator' | 'member';
		permissions: number;
		changes: { id: string; access: AccessChoice }[];
	};
</script>

<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { AccessChoice, AccessRow } from '$lib/organization/component/access-dialog.svelte';
	import { usernameSchema } from '$lib/organization/username-form';
	import {
		ADMINISTRATION_BY_ROLE,
		maskOf,
		permits,
		type Administration
	} from '@rentable/workspace-permission';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import UserIcon from '@lucide/svelte/icons/user';
	import XIcon from '@lucide/svelte/icons/x';
	import type { Snippet } from 'svelte';

	/**
	 * One member, on one surface: what they are called, what else they may do, and the workspaces
	 * they hold.
	 *
	 * **Heavy: the edge panel** ([[rules/interface]], *Form surface*), and the weight is what the
	 * form is rather than what the window is. Opened from a member's card, by its address or its
	 * edit entry, and never on the owner's card or the reader's own; Rust refuses both again on
	 * the signed row. *It was two dialogs, a role with seven checkboxes and a list of workspaces,
	 * reached from two entries of one menu; effort 828, requirement 23 made them one surface, on
	 * the human's word that one person's standing was split across two. It opened as the centred
	 * panel until the human saw it in the running build: this is a person's whole standing read
	 * beside the directory it was opened from, which is what the heavy weight is for.*
	 *
	 * **It reads as a directory: a tray on top, records below** (the human's second look). The
	 * tray carries the role, which is the one choice about the whole person, with the sentence
	 * that role means under it. Under the tray sit two lists, each with its own head and its own
	 * control where it has one: what this member is also allowed, and the workspaces they hold.
	 * So the eye meets the same shape here as in the members and workspaces directories rather
	 * than a column of headings floating in a form. *The save stays in the surface's own footer,
	 * where every write here keeps it: the shared form surface owns that band, and a tray holding
	 * a second one would put the two halves of one act in two places.*
	 *
	 * **A role is described by who it is for** (`organization.roles.<role>.who`), which is what
	 * every product in
	 * [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/evidence/research/how-products-present-roles-and-permissions]]
	 * does and what lets the chooser stand on its own. The owner's role is never offered here:
	 * ownership moves a key and two rows, so it is handed over by its own act on the owner's own
	 * card (requirement 22).
	 *
	 * **The widening is an additive list, not a wall of toggles.** An administrator is created
	 * holding every act, so the list only ever means anything for a member and is drawn for one
	 * alone, with a line in its place for anybody else. What is listed is what they were widened
	 * by, one plain sentence each under people and workspaces, with a control that takes one back
	 * and one that opens a chooser of the rest. *The seven checkboxes, most of them already on,
	 * are what the human asked to be rid of.*
	 *
	 * **Giving somebody an act that signs a row is the owner's alone**, because only the owner's
	 * vault derives the key that certifies a signer. Six of the seven acts sign; `renameWorkspace`
	 * writes the sealed name outside the signature and is the one that does not. So a reader who
	 * is not the owner is offered the signing acts nowhere: the chooser leaves out what it cannot
	 * hand over, and the absence is the whole of what needs saying. Narrowing is still theirs, so
	 * every act the member holds keeps its remove. *The list of what signs is stated here and in
	 * `organization/permission.rs`; the package carries the acts and not which of them signs.*
	 *
	 * **What each section is drawn for is what this reader may write.** The name is
	 * `renameMember`'s, the role and the widening are `changeRole`'s and the workspaces are
	 * `grantWorkspace`'s (effort 826, requirement 15), so a reader holding one of the three meets
	 * one section rather than a surface of controls that refuse them.
	 *
	 * **The name is a section of this surface, not a surface of its own** (effort 832, requirement
	 * 6). A member's card offered *rename* and *edit* side by side, two verbs for one person's
	 * standing; there is one edit now, and it opens this. The rule is requirement 21's of effort
	 * 824, the one schema in `organization/username-form.ts` with the sentence Rust refuses with,
	 * checked when the field is left and again on the save. Whether a username is taken is Rust's
	 * alone, and that refusal marks the name the way the others mark their sections.
	 *
	 * **One save runs the acts that exist**, and each refuses as it refuses today. A refusal marks
	 * its own section ([[rules/interface]], *Validation errors*): the grants' on the workspaces,
	 * and the role act's on whichever of the two asked for the change, since one act writes both
	 * the role and the column.
	 *
	 * **The mutations are the caller's.** This owns the surface and what is chosen on it, and
	 * hands the three up through `onSave`.
	 */
	let {
		open,
		onOpenChange,
		username,
		role,
		permissions,
		rows,
		canRename,
		canChangeRole,
		canGrantWorkspace,
		canGrantSigning,
		canGrantReadOnly,
		isSaving,
		nameRefusal,
		roleRefusal,
		workspacesRefusal,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the member whose row this writes, named in the description and opening the name field. */
		username: string;
		/** the role their row carries now. The owner's row never opens this. */
		role: string;
		/** the permission value their row carries now. */
		permissions: number;
		/** every workspace a grant can be held on, with what this member holds on it today. */
		rows: AccessRow[];
		/** whether the reader's row carries `renameMember`: the name. */
		canRename: boolean;
		/** whether the reader's row carries `changeRole`: the role and the widening. */
		canChangeRole: boolean;
		/** whether the reader's row carries `grantWorkspace`: the workspaces. */
		canGrantWorkspace: boolean;
		/** whether the reader is the owner, which is who may hand out an act that signs a row. */
		canGrantSigning: boolean;
		/** whether the reader is the owner, which is who mints a read only credential. */
		canGrantReadOnly: boolean;
		isSaving: boolean;
		/** what the rename was refused with, or `null`. */
		nameRefusal: string | null;
		/** what the role act was refused with, or `null`. */
		roleRefusal: string | null;
		/** what the grants were refused with, or `null`. */
		workspacesRefusal: string | null;
		onSave: (edit: MemberEdit) => void;
	} = $props();

	/**
	 * the one act of the seven that signs nothing: `renameWorkspace` writes the sealed workspace
	 * name outside the signature, so a member holding it needs no certificate and any holder of
	 * `changeRole` can hand it out.
	 */
	const SIGNS_NOTHING: Administration = 'renameWorkspace';

	/**
	 * the seven acts in the order they read, the ones about people before the ones about
	 * workspaces.
	 *
	 * **Read as an order rather than as groups.** They were drawn under two headings, which put
	 * two headings and a rule over a list of at most seven short lines; the human saw it and said
	 * it read as a second permissions form. The order still does the grouping's work, and the list
	 * is what it is: a few lines saying what this person can do.
	 */
	const IN_ORDER: Administration[] = [
		'inviteMember',
		'removeMember',
		'renameMember',
		'resetPassword',
		'changeRole',
		'renameWorkspace',
		'grantWorkspace'
	];

	/** the two roles this writes, in the order they are offered. The owner's is never one. */
	const ROLES = ['member', 'administrator'] as const;

	/** the three levels a grant can be held at, fullest first. */
	const LEVELS: AccessChoice[] = ['full-access', 'read-only', 'none'];

	let chosenName = $state('');
	/** what the name field was refused with here, before anything was written. */
	let nameInvalid = $state<string | null>(null);
	let chosenRole = $state<'administrator' | 'member'>('member');
	let chosen = $state<number>(0);
	let access = $state<Record<string, AccessChoice>>({});

	// a fresh open starts on what the row holds, with nothing left over from the last member.
	$effect(() => {
		if (open) {
			chosenName = username;
			nameInvalid = null;
			chosenRole = role === 'administrator' ? 'administrator' : 'member';
			chosen = permissions;
			access = Object.fromEntries(rows.map((row) => [row.id, row.access]));
		}
	});

	const roleLabel = (value: string) =>
		({
			owner: $LL.layout.signIn.roleOwner(),
			administrator: $LL.layout.signIn.roleAdministrator(),
			member: $LL.layout.signIn.roleMember()
		})[value] ?? value;

	const roleWho = (value: string) =>
		({
			owner: $LL.organization.roles.owner.who(),
			administrator: $LL.organization.roles.administrator.who(),
			member: $LL.organization.roles.member.who()
		})[value] ?? '';

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

	/**
	 * allow everything ticked, in one act.
	 *
	 * **One confirm rather than one press per act.** Widening somebody usually means two or three
	 * acts at once, and a picker that closed on each one made the person open it again for the
	 * next; the human said as much. Nothing is written here either way: the save is still what
	 * writes the column.
	 */
	const allow = () => {
		for (const act of ticked) add(act);

		ticked = [];
		picking = false;
	};

	const wasAdministrator = $derived(role === 'administrator');
	const roleChanged = $derived(chosenRole !== (wasAdministrator ? 'administrator' : 'member'));

	/**
	 * whether the role act's refusal belongs to the widening rather than to the role.
	 *
	 * One act writes both, so what it was asked for is what says which section refused: a save
	 * that left the role alone and changed the acts was refused about an act.
	 */
	const refusedOnActs = $derived(roleRefusal !== null && !roleChanged && chosenRole === 'member');

	// picking a role fills the list in with what that role is created with, and leaves it
	// editable: the column is still what the member may do (826, requirement 6).
	const pickRole = (value: string) => {
		if (value !== 'administrator' && value !== 'member') return;

		chosenRole = value;
		chosen = ADMINISTRATION_BY_ROLE[value];
	};

	const add = (act: Administration) => {
		if (!permits(chosen, act)) chosen = chosen + maskOf(act);
	};

	const drop = (act: Administration) => {
		if (permits(chosen, act)) chosen = chosen - maskOf(act);
	};

	const pickAccess = (id: string, value: string) => {
		if (value === 'none' || value === 'full-access' || value === 'read-only') {
			access[id] = value;
		}
	};

	// built when this component is, past the locale gate, for the reason
	// `organization/workspace-form.ts` gives: the message resolves against a locale.
	const nameSchema = usernameSchema($LL);

	/** the name as it would be written, or `null` with the sentence it is refused with marked. */
	const checkName = () => {
		const parsed = nameSchema.safeParse(chosenName);

		nameInvalid = parsed.success ? null : (parsed.error.issues[0]?.message ?? null);

		return parsed.success ? parsed.data : null;
	};

	const nameError = $derived(nameInvalid ?? nameRefusal);

	const enhance = onSubmit(() => {
		if (isSaving) return;

		// the name is checked only where it is this reader's to write; anybody else hands back the
		// one the member holds, which is no change.
		const name = canRename ? checkName() : username;

		if (name === null) return;

		onSave({
			username: name,
			role: chosenRole,
			permissions: chosen,
			changes: rows
				.filter((row) => (access[row.id] ?? row.access) !== row.access)
				.map((row) => ({ id: row.id, access: access[row.id] ?? row.access }))
		});
	});
</script>

<!--
	the bar the sheet opens with: what this person is, one sentence, and the one control about the
	whole of them.

	**The directory's shape, on a surface that is not a page** (the human's second look). It is
	`organization/component/directory-tray.svelte` read twice over: that block hardcodes the page
	treatment its two sections want, a card-coloured bar with a `legend` sized for a section, and
	both are wrong inside a panel that is already card-coloured. Two props would close the gap, a
	`class` on the bar and the legend's `variant`; until something else wants them, the shape is
	three lines here rather than two presentation props on a block that draws a section head.
-->
{#snippet tray(id: string, legend: string, description: string, control: Snippet | null)}
	<div data-sheet-tray={id} class="flex flex-col gap-2 rounded-2xl bg-muted/30 px-3 py-2.5">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<Field.Legend id={`${id}-legend`} variant="label" class="mb-0">{legend}</Field.Legend>

			{#if control}
				<div class="flex shrink-0 items-center gap-3">{@render control()}</div>
			{/if}
		</div>

		<!-- under the control, and about what it holds now: a segmented control has no room for a
		     sentence per option, so the one chosen is the one said. -->
		<Field.Description>{description}</Field.Description>
	</div>
{/snippet}

<!--
	the head a list opens with: its name, one sentence, and the control that adds to it.

	**Plainer than the tray above it**, and deliberately: the tray is the one bar on this surface,
	and a list underneath that repeats the treatment reads as a second form rather than as a list.
	*Both lists carried the bar until the human's third look.*
-->
{#snippet listHead(id: string, legend: string, description: string, control: Snippet | null)}
	<div class="flex items-start justify-between gap-3" data-list-head={id}>
		<div class="min-w-0">
			<Field.Legend id={`${id}-legend`} variant="label" class="mb-1">{legend}</Field.Legend>
			<Field.Description>{description}</Field.Description>
		</div>

		{#if control}
			<div class="flex shrink-0 items-center gap-3">{@render control()}</div>
		{/if}
	</div>
{/snippet}

<!-- the role, which is the one choice about the whole person, so it is the tray's own control. -->
{#snippet roleChooser()}
	<!-- the two roles this writes, side by side as a choice of two is ([[rules/interface]], *Field
	     kinds*). An administrator is created holding every act and six of them sign, so for anybody
	     but the owner the role is drawn refused rather than hidden, and the sentence under the tray
	     says whose it is. Pressing the one already chosen would unset a single group, and a member
	     always holds a role, so the setter leaves that alone. -->
	<ToggleGroup.Root
		type="single"
		variant="outline"
		id="member-role"
		aria-labelledby="member-role-tray-legend"
		class="w-full sm:w-auto"
		bind:value={() => chosenRole, pickRole}
		disabled={isSaving}
	>
		{#each ROLES as value (value)}
			<ToggleGroup.Item
				{value}
				class="flex-1 capitalize"
				data-role={value}
				disabled={value === 'administrator' && !canGrantSigning}
			>
				{roleLabel(value)}
			</ToggleGroup.Item>
		{/each}
	</ToggleGroup.Root>
{/snippet}

<!--
	the picker: everything this member is not allowed yet, ticked and then allowed in one press.

	**Several at once, because widening somebody is usually two or three acts.** A chooser that
	closed on each one made the person open it again for the next, which is the fiddliness the
	human named. Nothing is written from here: the confirm puts the acts on the list, and the
	save is what writes the column.

	**What this reader may not hand over is absent**, not drawn refused: a control that cannot
	change anything is noise on a picker whose whole point is what can be added.
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
					disabled={isSaving}
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
								id={`allow-${act}`}
								checked={ticked.includes(act)}
								onCheckedChange={(state) => tick(act, state === true)}
							/>
							<Field.Label for={`allow-${act}`} class="flex-1 font-normal">
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

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.common.actions.edit()}
	description={$LL.organization.dashboard.memberSheetDescription({ username })}
>
	<div class="flex flex-col gap-6" data-member-sheet>
		{#if canRename}
			<!-- what they are called, first: it is who the rest of the sheet is about. -->
			<Field.Set class="gap-3" aria-labelledby="member-name-legend" data-sheet-section="name">
				{@render listHead(
					'member-name',
					$LL.organization.dashboard.username(),
					$LL.organization.dashboard.renameDescription(),
					null
				)}

				<InputGroup.Root class={insetControl} data-disabled={isSaving || undefined}>
					<InputGroup.Addon>
						<UserIcon />
					</InputGroup.Addon>
					<InputGroup.Input
						name="username"
						autocomplete="off"
						aria-labelledby="member-name-legend"
						bind:value={chosenName}
						placeholder={$LL.organization.dashboard.username()}
						disabled={isSaving}
						aria-invalid={nameError ? 'true' : undefined}
						onfocusout={() => {
							if (chosenName !== username) checkName();
						}}
					/>
				</InputGroup.Root>

				{#if nameError}
					<Field.Error data-sheet-error="name">{nameError}</Field.Error>
				{/if}
			</Field.Set>
		{/if}

		{#if canChangeRole}
			<Field.Set class="gap-3" aria-labelledby="member-role-tray-legend" data-sheet-section="role">
				<!-- the sentence under the control is the role chosen now, not a list of the two: what
				     the other means is said the moment it is pressed. -->
				{@render tray(
					'member-role-tray',
					$LL.organization.dashboard.role(),
					roleWho(chosenRole),
					roleChooser
				)}

				{#if !canGrantSigning}
					<Field.Description data-role-refusal>
						{$LL.organization.dashboard.administratorsAreTheOwners()}
					</Field.Description>
				{/if}

				<!-- an administrator holds every act already, so the list below has nothing to allow or
				     take away and one line stands in its place. -->
				{#if chosenRole === 'administrator'}
					<Field.Description data-acts-every>
						{$LL.organization.dashboard.administratorAllowedEvery()}
					</Field.Description>
				{/if}

				{#if roleRefusal && !refusedOnActs}
					<Field.Error data-sheet-error="role">{roleRefusal}</Field.Error>
				{/if}
			</Field.Set>

			{#if chosenRole === 'member'}
				<Field.Set class="gap-3" aria-labelledby="acts-legend" data-sheet-section="acts">
					{@render listHead(
						'acts',
						$LL.organization.dashboard.beyondRole(),
						$LL.organization.dashboard.beyondRoleDescription(),
						addable.length > 0 ? allowActs : null
					)}

					<!-- a plain list, one line per act: at most seven short lines, so nothing here is
					     boxed, ruled or grouped. The x is quiet and sits at the end of its own line,
					     the way an exception is taken off a list. -->
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
										disabled={isSaving}
										onclick={() => drop(act)}
									>
										<XIcon />
										<span class="sr-only">{$LL.common.actions.remove()} {actDoes(act)}</span>
									</Button>
								</li>
							{/each}
						</ul>
					{/if}

					{#if refusedOnActs}
						<Field.Error data-sheet-error="acts">{roleRefusal}</Field.Error>
					{/if}
				</Field.Set>
			{/if}
		{/if}

		{#if canGrantWorkspace}
			<Field.Set class="gap-3" aria-labelledby="workspaces-legend" data-sheet-section="workspaces">
				{@render listHead(
					'workspaces',
					$LL.settings.section.workspaces(),
					$LL.organization.dashboard.accessTakenBack(),
					null
				)}

				{#if rows.length === 0}
					<Field.Description>{$LL.organization.dashboard.noWorkspaces()}</Field.Description>
				{/if}

				{#each rows as row (row.id)}
					{@const level = access[row.id] ?? row.access}
					<!-- a record of this list: the workspace, what they hold on it in words, and the
					     control that changes it. -->
					<div
						class="flex flex-col gap-2 rounded-2xl px-3 py-2 ring-1 ring-foreground/5"
						data-access-row={row.id}
					>
						<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<Field.Label id={`access-${row.id}-label`} class="min-w-0 truncate">
								{row.name}
							</Field.Label>

							<!-- each level named on its own segment, and read only drawn refused rather
							     than absent for anybody but the owner, because the access exists and who
							     mints it is worth saying. -->
							<ToggleGroup.Root
								type="single"
								variant="outline"
								size="sm"
								class="w-full shrink-0 sm:w-auto"
								id={`access-${row.id}`}
								aria-labelledby={`access-${row.id}-label`}
								bind:value={() => level, (value) => pickAccess(row.id, value)}
								disabled={isSaving}
							>
								{#each LEVELS as offered (offered)}
									<ToggleGroup.Item
										value={offered}
										class="flex-1"
										data-level={offered}
										disabled={offered === 'read-only' &&
											!canGrantReadOnly &&
											row.access !== 'read-only'}
									>
										{accessLabel(offered)}
									</ToggleGroup.Item>
								{/each}
							</ToggleGroup.Root>
						</div>

						<!-- what the level chosen is good for, under the control: that sentence is the
						     fact a person chooses on, and a segment has no room for one of its own. -->
						<span
							class="block text-xs leading-snug text-muted-foreground"
							data-access-says={row.id}
						>
							{accessDoes(level)}
						</span>
					</div>
				{/each}

				{#if !canGrantReadOnly && rows.length > 0}
					<Field.Description data-access-refusal>
						{$LL.organization.dashboard.readOnlyIsTheOwners()}
					</Field.Description>
				{/if}

				{#if workspacesRefusal}
					<Field.Error data-sheet-error="workspaces">{workspacesRefusal}</Field.Error>
				{/if}
			</Field.Set>
		{/if}
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving}>
			<SaveIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.save()}
		</Button>
	{/snippet}
</FormSurface>
