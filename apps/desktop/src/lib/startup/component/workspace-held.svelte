<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { UpdateAction } from '$lib/update/ui';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import CircleFadingArrowUpIcon from '@lucide/svelte/icons/circle-fading-arrow-up';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';

	/**
	 * A workspace this build cannot read, and the way past it (effort 857, requirement 7).
	 *
	 * **It stands inside the application, in place of the workspace** ([[rules/interface]],
	 * *Application surfaces*): the rail and the titlebar stay up around it, since the organization
	 * opened and only this workspace did not, and the page frame holds it where the page would be.
	 * It is neither a step of the way in nor the application failing, so it takes neither of their
	 * surfaces.
	 *
	 * **Three things, in the order a person needs them.** Which workspace this is, named as the
	 * session names it under the update's glyph; why it cannot open, in one sentence; and the
	 * update action as its `screen`, which checks, downloads, and restarts into a newer rentable.
	 * Under them, where the session holds others, the way to one of those: a plain list of their
	 * names, each opening that workspace as the rail's workspace control would. A person who cannot
	 * update now is never kept here.
	 *
	 * Nothing of the workspace is drawn, since none of it could be read.
	 *
	 * **A workspace refused for a reason that is not its version stands here too** (ticket 25): it
	 * would not open, the organization did, and the person stays in it. Updating is no way past
	 * such a refusal, so the screen says the reason under an alert's glyph and offers to try the
	 * workspace again in the update action's place, since what refused it (a full disk, a member
	 * yet to bring it up) can pass. The way to the others is the same.
	 */
	let {
		workspaceId,
		name,
		sentence,
		byVersion,
		workspaces,
		onSwitch,
		onRetry
	}: {
		/** the workspace held, which the screen is marked with. */
		workspaceId: string;
		/** what the session calls it. */
		name: string;
		/** why it cannot be opened, in the reader's language. */
		sentence: string;
		/** whether updating rentable is the way past it; trying again is, where it is not. */
		byVersion: boolean;
		/** the session's other workspaces, in the session's order. */
		workspaces: readonly { id: string; name: string }[];
		/** open another of them. */
		onSwitch: (workspaceId: string) => void;
		/** open this one again. */
		onRetry: () => void;
	} = $props();

	const listName = 'workspace-held-others';
</script>

<PageFrame>
	<section
		class="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-16 text-center"
		data-workspace-held={workspaceId}
	>
		<span
			class="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
			aria-hidden="true"
		>
			{#if byVersion}
				<CircleFadingArrowUpIcon class="size-6" />
			{:else}
				<CircleAlertIcon class="size-6" />
			{/if}
		</span>

		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold" data-workspace-held-name><bdi>{name}</bdi></h1>
			<p
				class="text-balance text-muted-foreground first-letter:uppercase"
				data-workspace-held-reason
			>
				{sentence}
			</p>
		</div>

		{#if byVersion}
			<UpdateAction variant="screen" />
		{:else}
			<Button data-workspace-held-retry onclick={onRetry}>
				<RefreshCwIcon />
				{$LL.layout.startup.tryAgain()}
			</Button>
		{/if}

		{#if workspaces.length > 0}
			<nav class="flex w-full flex-col gap-2 pt-4 text-start" aria-labelledby={listName}>
				<h2 id={listName} class="text-sm font-medium text-muted-foreground first-letter:uppercase">
					{$LL.layout.startup.otherWorkspaces()}
				</h2>
				<ul class="flex flex-col gap-1">
					{#each workspaces as workspace (workspace.id)}
						<li>
							<Button
								variant="ghost"
								class="w-full justify-start gap-3"
								data-workspace-held-switch={workspace.id}
								onclick={() => onSwitch(workspace.id)}
							>
								<span class="flex-1 truncate text-start"><bdi>{workspace.name}</bdi></span>
								<ChevronRightIcon class="size-4 text-muted-foreground rtl:rotate-180" />
							</Button>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</section>
</PageFrame>
