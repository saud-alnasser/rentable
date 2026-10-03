<script lang="ts" module>
	/** one member the sheet can put in the workspace. */
	export type HolderCandidate = { id: string; username: string; role: string };
</script>

<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Command from '@rentable/design/primitive/command/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { onSubmit } from '$lib/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { matchesTerm } from '$lib/palette';
	import MemberSectionHead from '$lib/organization/component/section-head.svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import UserRoundPlusIcon from '@lucide/svelte/icons/user-round-plus';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The sheet the plus on a workspace's members opens, which puts several members in at once
	 * (effort 846, ticket 51, at the human's word of 2026-10-03: "the plus button opens a form or
	 * sheet and a search filed that dropdown filtered with the searched and added muliipjle members;
	 * it only shows members that are not in the workspace and simply add them to the workspace to
	 * complete the operation").
	 *
	 * **Heavy: the edge panel** ([[rules/interface]], *Form surface*): it chooses other records and
	 * writes one grant for each, as the member and contract forms do.
	 *
	 * **Another record chosen by searching** is `primitive/command` in `primitive/popover`
	 * ([[contexts/desktop/components]]), as the contract form chooses its tenant. The control is
	 * drawn as a search field (a leading glass and words saying what to find), and pressing it opens
	 * the members who are not in the workspace and not chosen yet, every one before anything is
	 * typed, narrowed by username through the comparison every set held in memory folds with
	 * (`matchesTerm`). Choosing one puts them on the chosen list under it and out of the dropdown,
	 * which stays open for the next; each on the list is taken off with its own control.
	 *
	 * **One save hands every chosen member up** (`onSave`), and the caller grants them in one write.
	 * A save with nobody chosen says to choose somebody. What the shell refused stands under the list
	 * (`error`), and those still listed are the ones not put in, since a member granted leaves the
	 * candidates.
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
		/** every member who could be put in and is not in yet. */
		candidates: HolderCandidate[];
		isSaving: boolean;
		/** what the shell refused the last save with, or `null`. */
		error?: string | null;
		onSave: (memberIds: string[]) => void;
	} = $props();

	let picking = $state(false);
	let search = $state('');
	/** the members chosen, in the order they were chosen. */
	let chosenIds = $state<string[]>([]);
	/** said where the save had nobody to put in. */
	let nobody = $state(false);

	// a fresh open starts with nobody chosen.
	$effect(() => {
		if (open) {
			chosenIds = [];
			search = '';
			nobody = false;
		}
	});

	/** the chosen who can still be put in: one granted already has left the candidates. */
	const chosen = $derived(
		chosenIds.flatMap((id) => candidates.filter((candidate) => candidate.id === id))
	);

	const shown = $derived(
		candidates.filter(
			(candidate) => !chosenIds.includes(candidate.id) && matchesTerm(candidate.username, search)
		)
	);

	const setPicking = (next: boolean) => {
		picking = next && !isSaving;

		if (!picking) search = '';
	};

	const choose = (memberId: string) => {
		chosenIds = [...chosenIds, memberId];
		search = '';
		nobody = false;
	};

	const unchoose = (memberId: string) => {
		chosenIds = chosenIds.filter((id) => id !== memberId);
	};

	const enhance = onSubmit(() => {
		if (isSaving) return;

		if (chosen.length === 0) {
			nobody = true;

			return;
		}

		onSave(chosen.map((candidate) => candidate.id));
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
	<div class="flex flex-col gap-6" data-holders-add-sheet>
		<Popover.Root bind:open={() => picking, setPicking}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						disabled={isSaving}
						class={cn('w-full justify-start gap-2 font-normal text-muted-foreground', insetControl)}
						data-holder-pick
					>
						<SearchIcon class="size-4 shrink-0" aria-hidden="true" />
						<span class="min-w-0 flex-1 truncate text-start">
							{$LL.organization.workspacePage.addPlaceholder()}
						</span>
					</Button>
				{/snippet}
			</Popover.Trigger>

			<Popover.Content class="w-(--bits-popover-anchor-width) min-w-72 p-0" align="start">
				<Command.Root class="w-full" shouldFilter={false} data-holder-candidates>
					<Command.Input
						bind:value={search}
						placeholder={$LL.organization.workspacePage.searchPlaceholder()}
					/>
					<Command.List>
						{#if shown.length === 0}
							<div class="p-3 text-sm text-muted-foreground" data-holder-no-match>
								{candidates.length === chosen.length
									? $LL.organization.workspacePage.nobodyToAdd()
									: $LL.organization.workspacePage.noMatch()}
							</div>
						{:else}
							<Command.Group>
								{#each shown as candidate (candidate.id)}
									<Command.Item
										value={candidate.id}
										onSelect={() => choose(candidate.id)}
										data-holder-candidate={candidate.id}
									>
										<UserRoundPlusIcon class="size-4 shrink-0" aria-hidden="true" />
										<span class="min-w-0 flex-1 truncate text-start">
											<bdi>{candidate.username}</bdi>
										</span>
										<span class="shrink-0 text-xs text-muted-foreground">
											<bdi>{candidate.role}</bdi>
										</span>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>

		<Field.Set class="gap-3" aria-labelledby="holders-chosen-legend" data-holders-chosen>
			<MemberSectionHead
				id="holders-chosen"
				legend={$LL.organization.workspacePage.chosen()}
				description={chosen.length === 0 ? $LL.organization.workspacePage.nobodyChosen() : null}
			/>

			{#if chosen.length > 0}
				<ul class="flex flex-col gap-1">
					{#each chosen as member (member.id)}
						<li class="flex min-h-10 items-center gap-2" data-holder-chosen={member.id}>
							<UserRoundIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1 truncate text-sm"><bdi>{member.username}</bdi></span>
							<span class="shrink-0 text-xs text-muted-foreground"><bdi>{member.role}</bdi></span>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								disabled={isSaving}
								aria-label={$LL.organization.workspacePage.unchoose({ username: member.username })}
								onclick={() => unchoose(member.id)}
								data-holder-unchoose={member.id}
							>
								<XIcon />
							</Button>
						</li>
					{/each}
				</ul>
			{/if}

			{#if nobody || error}
				<Field.Error data-holders-add-error>
					{#if nobody}
						{$LL.organization.workspacePage.chooseSomebody()}
					{:else}
						{error}
						{$LL.organization.workspacePage.notAllAdded()}
					{/if}
				</Field.Error>
			{/if}
		</Field.Set>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every primary here carries one. -->
		<Button type="submit" disabled={isSaving}>
			<UserPlusIcon class="size-4" />
			{isSaving ? $LL.common.actions.working() : $LL.common.actions.add()}
		</Button>
	{/snippet}
</FormSurface>
