<script lang="ts">
	import Loading from '@rentable/design/block/loading.svelte';
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import { Skeleton } from '@rentable/design/primitive/skeleton/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * What the page shows while a switch opens another workspace.
	 *
	 * **A page loading, not the application starting** (effort 843, requirement 12). The rail and
	 * the titlebar stay up around it, so what changes is only where the page was: the shared loading
	 * block ([[rules/interface]], *Loading*) inside the page frame, shaped like a page, with one line
	 * naming the workspace being opened. The startup bar is for a launch, whose stages are the
	 * wait; a switch is the second a sign-in costs, and a bar for it would read as starting over.
	 *
	 * **Nothing of either workspace is drawn here.** The old one's rows would be under the new name,
	 * and the new one's are not read yet, so the shape stands in for both.
	 */
	let {
		name
	}: {
		/** the workspace being opened, as the session names it. */
		name: string;
	} = $props();

	const label = $derived($LL.layout.startup.switching({ name }));
</script>

<PageFrame>
	<!-- always loading: the pass ending is what takes this screen away. -->
	<Loading loading {label} class="flex flex-col gap-6">
		{#snippet skeleton()}
			<!-- the shape of a page: its title, named as the workspace opening, over a few rows. -->
			<div class="flex flex-col gap-2">
				<p class="text-sm text-muted-foreground">{label}</p>
				<Skeleton class="h-7 w-48" />
			</div>
			<div class="flex flex-col gap-3">
				{#each { length: 5 }, row (row)}
					<Skeleton class="h-10 w-full rounded-xl" />
				{/each}
			</div>
		{/snippet}
	</Loading>
</PageFrame>
