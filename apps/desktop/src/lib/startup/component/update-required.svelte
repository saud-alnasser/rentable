<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { UpdateAction } from '$lib/update/ui';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import CircleFadingArrowUpIcon from '@lucide/svelte/icons/circle-fading-arrow-up';

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
	 */
	let {
		workspaceId,
		name,
		sentence,
		workspaces,
		onSwitch
	}: {
		/** the workspace held, which the screen is marked with. */
		workspaceId: string;
		/** what the session calls it. */
		name: string;
		/** why it cannot be opened, in the reader's language. */
		sentence: string;
		/** the session's other workspaces, in the session's order. */
		workspaces: readonly { id: string; name: string }[];
		/** open another of them. */
		onSwitch: (workspaceId: string) => void;
	} = $props();

	const listName = 'update-required-others';
</script>

<PageFrame>
	<section
		class="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-16 text-center"
		data-update-required={workspaceId}
	>
		<span
			class="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"
			aria-hidden="true"
		>
			<CircleFadingArrowUpIcon class="size-6" />
		</span>

		<div class="flex flex-col gap-2">
			<h1 class="text-xl font-semibold" data-update-required-name><bdi>{name}</bdi></h1>
			<p
				class="text-balance text-muted-foreground first-letter:uppercase"
				data-update-required-reason
			>
				{sentence}
			</p>
		</div>

		<UpdateAction variant="screen" />

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
								data-update-required-switch={workspace.id}
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
