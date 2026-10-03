<script lang="ts" module>
	/** one member the field can put in the workspace. */
	export type HolderCandidate = { id: string; username: string; role: string };
</script>

<script lang="ts">
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Command from '@rentable/design/primitive/command/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { matchesTerm } from '$lib/palette';
	import SearchIcon from '@lucide/svelte/icons/search';
	import UserRoundPlusIcon from '@lucide/svelte/icons/user-round-plus';

	/**
	 * The field that finds a member and puts them in the workspace, under the workspace page's
	 * header (effort 846, ticket 50, at the human's word of 2026-10-03: "a record search bar or
	 * feild that you search for a member then add them to the worksace").
	 *
	 * **Another record chosen by searching** is `primitive/command` in `primitive/popover`
	 * ([[contexts/desktop/components]]), as the contract's tenant is chosen. Here the control is
	 * drawn as the search field every set draws (a leading glass and words saying what to find),
	 * and pressing it opens the members who are not in the workspace, every one before anything is
	 * typed, since an organization's are a handful, narrowed by username as the reader types,
	 * through the comparison every set held in memory folds with (`matchesTerm`). Choosing one hands
	 * them up through `onAdd`, and the page writes it at once: nothing on the page is a form.
	 *
	 * **Refused, it says why** ([[rules/interface]], *Guidance*): where the reader may put nobody
	 * in (`refusal`, the reader without `grantWorkspace` or holding the workspace read only), the
	 * control is dimmed, opens nothing, and the reason stands under it and in its tooltip. With
	 * nobody left to put in, the control says so in place of its words and opens nothing. What the
	 * shell refused the last choice with (`error`) stands under it too, as the shared handler says it.
	 */
	let {
		candidates,
		refusal = null,
		error = null,
		writing,
		onAdd
	}: {
		/** every member who could be put in and is not in yet. */
		candidates: HolderCandidate[];
		/** why the reader may put nobody in, or `null` where they may. */
		refusal?: string | null;
		/** what the shell refused the last choice with, or `null`. */
		error?: string | null;
		/** whether a write on the page is running, which the field waits for. */
		writing: boolean;
		onAdd: (memberId: string) => void;
	} = $props();

	let open = $state(false);
	let search = $state('');

	const nobodyLeft = $derived(refusal === null && candidates.length === 0);
	const usable = $derived(refusal === null && !nobodyLeft && !writing);

	const shown = $derived(candidates.filter((candidate) => matchesTerm(candidate.username, search)));

	const setOpen = (next: boolean) => {
		open = next && usable;

		if (!open) search = '';
	};

	const choose = (memberId: string) => {
		setOpen(false);
		onAdd(memberId);
	};
</script>

<div class="flex flex-col gap-1.5" data-holder-field>
	<Popover.Root bind:open={() => open, setOpen}>
		<Tooltip.Root disabled={refusal === null}>
			<Tooltip.Trigger>
				{#snippet child({ props: hint })}
					<Popover.Trigger>
						{#snippet child({ props })}
							<Button
								{...hint}
								{...props}
								variant="outline"
								class={cn(
									'w-full justify-start gap-2 font-normal text-muted-foreground sm:max-w-sm',
									!usable && unavailableControl
								)}
								aria-disabled={usable ? undefined : 'true'}
								aria-describedby={refusal ? 'holder-add-refusal' : undefined}
								aria-busy={writing ? 'true' : undefined}
								data-holder-add
							>
								<SearchIcon class="size-4 shrink-0" aria-hidden="true" />
								<span class="min-w-0 flex-1 truncate text-start">
									{nobodyLeft
										? $LL.organization.workspacePage.nobodyToAdd()
										: $LL.organization.workspacePage.addPlaceholder()}
								</span>
							</Button>
						{/snippet}
					</Popover.Trigger>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>
				<span data-unavailable-reason>{refusal}</span>
			</Tooltip.Content>
		</Tooltip.Root>

		<Popover.Content class="w-(--bits-popover-anchor-width) min-w-72 p-0" align="start">
			<Command.Root class="w-full" shouldFilter={false} data-holder-candidates>
				<Command.Input
					bind:value={search}
					placeholder={$LL.organization.workspacePage.searchPlaceholder()}
				/>
				<Command.List>
					{#if shown.length === 0}
						<div class="p-3 text-sm text-muted-foreground" data-holder-no-match>
							{$LL.organization.workspacePage.noMatch()}
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

	{#if refusal}
		<Field.Description id="holder-add-refusal" data-holder-add-refusal>{refusal}</Field.Description>
	{/if}

	{#if error}
		<Field.Error data-holder-add-error>{error}</Field.Error>
	{/if}
</div>
