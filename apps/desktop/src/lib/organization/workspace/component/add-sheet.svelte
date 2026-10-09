<script lang="ts" module>
	/** one member the sheet can put in the workspace. */
	export type HolderCandidate = { id: string; username: string; role: string };
</script>

<script lang="ts">
	import Empty from '@rentable/design/block/empty.svelte';
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import { Badge } from '@rentable/design/primitive/badge/index.js';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { onSubmit } from '$lib/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { SearchField } from '$lib/list/ui';
	import { matchesTerm } from '$lib/palette';
	import { accountInitials } from '$lib/sync';
	import CheckIcon from '@lucide/svelte/icons/check';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The sheet the plus on a workspace's members opens, which puts several members in at once
	 * (effort 846, ticket 52, at the human's walk of 2026-10-03: "the add sheet desgin feels odd
	 * first when a member is choosen they just removed from the dropdown added in a free from list
	 * yet the dropdown remains; try to find the best way to add a member using the plus").
	 *
	 * **Heavy: the edge panel** ([[rules/interface]], *Form surface*): it chooses other records and
	 * writes one grant for each, as the member and contract forms do.
	 *
	 * **One list, with nothing to open.** The shared search field at the top
	 * (`list/component/search-field.svelte`, *Search*) and under it every member not in the
	 * workspace, always shown, narrowed in place by username through the comparison every set held
	 * in memory folds with (`matchesTerm`). A row is the person as their card heads them (the
	 * disc, the username, the role's badge) with a check at its trailing edge, the way the
	 * platform's own add-people pickers mark several at once. Pressing a row, or Space on it,
	 * checks or unchecks it where it stands, so nothing moves between lists and nothing has to be
	 * found twice. The rows are a listbox with `aria-multiselectable`, one row in the tab order,
	 * the arrows, Home and End moving between them, and the down arrow reaching the first row from
	 * the field. The field does not answer `/`: it holds the focus as the sheet opens, and the
	 * page's own tray holds the key.
	 *
	 * **The one button counts the checked** (*add 2 members*) and is not pressable with none. Its
	 * save hands the checked up in the list's order (`onSave`), and the caller grants them in one
	 * write. What the shell refused stands under the list (`error`); a member granted before it
	 * has left the candidates, and so the list, and those still checked are the ones not put in.
	 */
	let {
		open,
		onOpenChange,
		workspaceName,
		candidates,
		isSaving,
		error = null,
		onSave
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the workspace members are being put in, which the description names. */
		workspaceName: string;
		/** every member who could be put in and is not in yet, in the order they are listed. */
		candidates: HolderCandidate[];
		isSaving: boolean;
		/** what the shell refused the last save with, or `null`. */
		error?: string | null;
		onSave: (memberIds: string[]) => void;
	} = $props();

	let search = $state('');
	/** the members checked, by id; the list's order is the order they are put in. */
	let checkedIds = $state<string[]>([]);
	/** the row the keyboard last stood on, which holds the list's one tab stop. */
	let activeId = $state<string | null>(null);
	let listbox = $state<HTMLElement | null>(null);

	/** whether the sheet was open when last looked at, so only an opening clears it. */
	let wasOpen = false;

	// a fresh open starts with nobody checked and nothing searched. Only the opening does: a
	// refusal hands the sheet new candidates while it stays open, and what is checked stands.
	$effect(() => {
		if (open && !wasOpen) {
			checkedIds = [];
			search = '';
			activeId = null;
		}

		wasOpen = open;
	});

	/** the checked who can still be put in: one granted already has left the candidates. */
	const checked = $derived(candidates.filter((candidate) => checkedIds.includes(candidate.id)));

	const shown = $derived(candidates.filter((candidate) => matchesTerm(candidate.username, search)));

	/** the row in the tab order: the one last stood on while it is shown, else the first. */
	const tabStop = $derived(
		shown.some((candidate) => candidate.id === activeId) ? activeId : (shown[0]?.id ?? null)
	);

	const toggle = (memberId: string) => {
		activeId = memberId;

		if (isSaving) return;

		checkedIds = checkedIds.includes(memberId)
			? checkedIds.filter((id) => id !== memberId)
			: [...checkedIds, memberId];
	};

	const focusRow = (memberId: string | undefined) => {
		if (!memberId) return;

		activeId = memberId;
		listbox?.querySelector<HTMLElement>(`[data-holder-candidate="${memberId}"]`)?.focus();
	};

	const onRowKey = (event: KeyboardEvent, memberId: string) => {
		const at = shown.findIndex((candidate) => candidate.id === memberId);
		const step = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: shown.length - 1 }[event.key];

		if (event.key === ' ') {
			event.preventDefault();
			toggle(memberId);
		} else if (step !== undefined) {
			event.preventDefault();
			focusRow(shown[Math.min(Math.max(step, 0), shown.length - 1)]?.id);
		}
	};

	// the down arrow in the field goes to the list, where the one stop stands.
	const onFieldKey = (event: KeyboardEvent) => {
		if (event.key !== 'ArrowDown' || !tabStop) return;

		event.preventDefault();
		focusRow(tabStop);
	};

	const enhance = onSubmit(() => {
		if (isSaving || checked.length === 0) return;

		onSave(checked.map((candidate) => candidate.id));
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={$LL.organization.workspacePage.addMembers()}
	description={$LL.organization.workspacePage.addDescription({ workspace: workspaceName })}
>
	<div class="flex flex-col gap-4" data-holders-add-sheet>
		<!-- the field's own keys stay its own; only the down arrow is taken, to reach the list. -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onkeydown={onFieldKey}>
			<SearchField
				bind:value={search}
				answersSearchKey={false}
				placeholder={$LL.organization.workspacePage.addPlaceholder()}
				class="rounded-lg bg-foreground/5 inset-shadow-sunken sm:max-w-none"
			/>
		</div>

		{#if candidates.length === 0}
			<div data-holders-nobody-left>
				<Empty kind="nothing-yet" title={$LL.organization.workspacePage.nobodyToAdd()} />
			</div>
		{:else if shown.length === 0}
			<!-- the search found nobody, and the way out is putting it down. -->
			<div data-holder-no-match>
				<Empty kind="no-match" title={$LL.organization.workspacePage.noMatch()}>
					{#snippet action()}
						<Button type="button" variant="outline" size="sm" onclick={() => (search = '')}>
							<XIcon />
							{$LL.common.actions.clearSearch()}
						</Button>
					{/snippet}
				</Empty>
			</div>
		{:else}
			<ul
				bind:this={listbox}
				role="listbox"
				aria-multiselectable="true"
				aria-label={$LL.organization.workspacePage.addMembers()}
				aria-disabled={isSaving || undefined}
				class="flex flex-col gap-0.5"
				data-holder-candidates
			>
				{#each shown as candidate (candidate.id)}
					{@const isChecked = checkedIds.includes(candidate.id)}
					<li
						role="option"
						aria-selected={isChecked}
						tabindex={candidate.id === tabStop ? 0 : -1}
						class={cn(
							'flex min-h-12 cursor-default items-center gap-3 rounded-lg px-3 py-2 transition-colors outline-none select-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring',
							isChecked && 'bg-primary/5 hover:bg-primary/10'
						)}
						onclick={() => toggle(candidate.id)}
						onkeydown={(event) => onRowKey(event, candidate.id)}
						onfocus={() => (activeId = candidate.id)}
						data-holder-candidate={candidate.id}
					>
						<!-- the same disc the member's card heads them with; the row's name is the words. -->
						<Avatar.Root class="size-8 shrink-0 rounded-full" aria-hidden="true">
							<Avatar.Fallback class="rounded-full text-xs">
								{accountInitials(candidate.username)}
							</Avatar.Fallback>
						</Avatar.Root>
						<span class="min-w-0 flex-1 truncate text-sm font-medium">
							<bdi>{candidate.username}</bdi>
						</span>
						<Badge variant="secondary" class="max-w-32 shrink">
							<bdi class="truncate">{candidate.role}</bdi>
						</Badge>
						<!-- the check at the trailing edge: an empty ring, filled and ticked once checked.
						     The row's own state says it to a screen reader. -->
						<span
							aria-hidden="true"
							class={cn(
								'flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors',
								isChecked
									? 'border-primary bg-primary text-primary-foreground'
									: 'border-muted-foreground/40'
							)}
							data-holder-check
						>
							{#if isChecked}
								<CheckIcon class="size-3.5" strokeWidth={3} />
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if error}
			<Field.Error data-holders-add-error>
				{error}
				{$LL.organization.workspacePage.notAllAdded()}
			</Field.Error>
		{/if}
	</div>

	{#snippet actions({ requestClose })}
		<Button type="button" variant="outline" disabled={isSaving} onclick={requestClose}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one; it counts what it
		     adds, and with nobody checked there is nothing to press. -->
		<Button type="submit" disabled={isSaving || checked.length === 0} data-holders-add-save>
			<UserPlusIcon class="size-4" />
			{isSaving
				? $LL.common.actions.working()
				: $LL.organization.workspacePage.addCount({ count: checked.length })}
		</Button>
	{/snippet}
</FormSurface>
