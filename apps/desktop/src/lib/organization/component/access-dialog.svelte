<script lang="ts" module>
	/** what one grant is good for, or that there is none. */
	export type AccessChoice = 'none' | 'full-access' | 'read-only';

	/** one thing a grant can be held on, with the access held on it today. */
	export type AccessRow = { id: string; name: string; access: AccessChoice };
</script>

<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import KeyIcon from '@lucide/svelte/icons/key-round';

	/**
	 * Grants, chosen one row at a time: none, full access, or read only.
	 *
	 * **Light: one control per row** ([[rules/interface]], *Form surface*). Opened from a
	 * workspace's card in the workspaces section, where the rows are the members who hold it and
	 * the subject is the workspace.
	 *
	 * **It takes rows rather than members, because a grant has two ends.** The workspaces section
	 * asks *who holds this workspace, and at what access*; the members section asks *which
	 * workspaces does this member hold*, which is the same question read the other way round. So
	 * the subject is named by the caller through `title` and `description`, and `rows` are
	 * whatever the caller is granting over. What comes back is the rows that changed, by their own
	 * ids. *The members section drew this too until `member-sheet.svelte` folded its rows into a
	 * section of one surface (effort 828, requirement 23); the shape of the rows is the same
	 * there.*
	 *
	 * **Read only is the owner's**, because minting a read-only credential needs the Turso
	 * authority that lives on the owner's machine (requirement 5). For anybody else it is drawn
	 * refused rather than hidden, with the sentence naming the owner; Rust refuses it again. A row
	 * that already holds read only keeps saying so: what is refused is granting it, not reading it.
	 *
	 * **Taking a grant back mints nothing**, so the credential the member already holds works
	 * until it expires. Cutting somebody off at once is the lock-out on a removal, and that is the
	 * owner's.
	 *
	 * **The mutation is the caller's.** This owns the surface and what is chosen on it, and hands
	 * the changes up through `onSave`, which resolves when they were written and rejects with what
	 * the shared handler has already said.
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
		/** every row a grant can be held on, with what it holds today. */
		rows: AccessRow[];
		/** whether this machine holds the Turso authority, which is what mints a read-only credential. */
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

	const accessLabel = (value: AccessChoice) =>
		({
			none: $LL.organization.dashboard.accessNone(),
			'full-access': $LL.organization.dashboard.accessFull(),
			'read-only': $LL.organization.dashboard.accessReadOnly()
		})[value];

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
	<div class="flex flex-col gap-4" data-access-form>
		{#if rows.length === 0}
			<Field.Description>{$LL.organization.dashboard.noWorkspaces()}</Field.Description>
		{/if}

		{#each rows as row (row.id)}
			<Field.Field orientation="horizontal" data-access-row={row.id}>
				<Field.Label for={`access-${row.id}`} class="flex-1 truncate">{row.name}</Field.Label>
				<Select.Root
					type="single"
					value={chosen[row.id] ?? row.access}
					onValueChange={(value) => {
						if (value === 'none' || value === 'full-access' || value === 'read-only') {
							chosen[row.id] = value;
						}
					}}
					disabled={isSaving}
				>
					<Select.Trigger id={`access-${row.id}`} class={cn('w-44 shrink-0', insetControl)}>
						{accessLabel(chosen[row.id] ?? row.access)}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="none" label={accessLabel('none')}>
							{accessLabel('none')}
						</Select.Item>
						<Select.Item value="full-access" label={accessLabel('full-access')}>
							{accessLabel('full-access')}
						</Select.Item>
						<!-- drawn refused rather than absent for anybody but the owner: the access
						     exists, and who mints it is the fact worth saying. -->
						<Select.Item
							value="read-only"
							label={accessLabel('read-only')}
							disabled={!canGrantReadOnly && row.access !== 'read-only'}
						>
							{accessLabel('read-only')}
						</Select.Item>
					</Select.Content>
				</Select.Root>
			</Field.Field>
		{/each}

		{#if !canGrantReadOnly && rows.length > 0}
			<Field.Description data-access-refusal>
				{$LL.organization.dashboard.readOnlyIsTheOwners()}
			</Field.Description>
		{/if}
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
