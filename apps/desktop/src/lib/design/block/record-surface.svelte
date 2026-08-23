<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/** One of a record's collections — the records that hang off it, not its own fields. */
	export type RecordCollection = {
		/** What names this collection in the address, where the record has more than one. */
		value: string;
		/** What the collection is called, read as its heading or as its choice. */
		label: string;
		/** The collection itself. */
		content: Snippet;
	};
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import BackControl from '$lib/design/block/back-control.svelte';
	import PageFrame from '$lib/design/block/page-frame.svelte';
	import * as Empty from '@rentable/design/primitive/empty/index.js';
	import * as Tabs from '@rentable/design/primitive/tabs/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { Spinner } from '@rentable/design/primitive/spinner/index.js';

	/**
	 * The surface one record is read on.
	 *
	 * Every concept has one, and the five that existed before this were written by hand: they
	 * held a byte-identical loading state, a byte-identical not-found state, and the same
	 * arrangement of a back control, an action cluster and a title — so the arrangement drifted
	 * at four of them. What they shared was chrome and mechanism rather than shape, which is why
	 * it converges here while what a record's body looks like stays with the module that owns the
	 * record (ADR 0032, narrowing ADR 0020).
	 *
	 * **A record's own fields are not one of its sections.** They read beneath the title area,
	 * always. What a reader may switch between is the record's *collections* — its contracts, its
	 * units, its payments — and four of the five records have exactly one, so most of them show
	 * it under a heading and offer no control at all.
	 */
	let {
		isLoading = false,
		found = false,
		backFallback,
		path,
		eyebrow,
		title,
		identity,
		actions,
		fields,
		collections = [],
		initialCollection
	}: {
		/** Whether the record is still on its way. */
		isLoading?: boolean;
		/** Whether the record was found. A surface that is neither found nor loading says so. */
		found?: boolean;
		/** Where back goes when the reader arrived here from nowhere — the concept's directory. */
		backFallback: string;
		/** This record's own address, already resolved and carrying no collection. */
		path: string;
		/** What kind of record this is, read above its name. */
		eyebrow: string;
		/** The record's name. Read only where the record was found. */
		title: string;
		/**
		 * What identifies the record besides its name, read without labels because format and
		 * context already say what each one is (_Labels are a last resort_).
		 */
		identity?: Snippet;
		/** The record's own controls, beside the shared ones. */
		actions?: Snippet;
		/** The record's own fields, read directly under the title area. */
		fields?: Snippet;
		/** What hangs off the record. One is shown under its heading; two or more are chosen between. */
		collections?: RecordCollection[];
		/** The collection the address arrived on, where the record has more than one. */
		initialCollection?: string;
	} = $props();

	// only a record with something to choose between puts a choice in the address; the rest have
	// nothing to say there, and four of the five used to say it anyway.
	const isChoosable = $derived(collections.length > 1);
	const defaultCollection = $derived(collections[0]?.value ?? '');
	const addressed = $derived(initialCollection ?? defaultCollection);

	// eslint-disable-next-line svelte/prefer-writable-derived
	let chosen = $state('');

	const collectionHref = (collection: string) =>
		collection === defaultCollection ? path : `${path}?section=${collection}`;

	$effect(() => {
		chosen = addressed;
	});

	$effect(() => {
		if (!isChoosable || chosen === addressed) {
			return;
		}

		// `path` is a route the concept already resolved, so the base is on it once — resolving
		// the href again would put it on twice.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(collectionHref(chosen), {
			replaceState: true,
			noScroll: true,
			keepFocus: true
		});
	});
</script>

{#snippet heading(text: string)}
	<h2 class="shrink-0 text-xs tracking-[0.2em] text-muted-foreground uppercase">{text}</h2>
{/snippet}

<!-- fills: a record's collections scroll inside their own panel, which they cannot do unless the
     frame above them is exactly as tall as the window. -->
<PageFrame fills>
	{#if isLoading}
		<div class="flex flex-1 items-center justify-center" aria-busy="true">
			<div class="flex flex-col items-center gap-3">
				<Spinner class="size-8 text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
			</div>
		</div>
	{:else if !found}
		<!-- the back control keeps its usual place, so a record that is not there is still a
		     screen the reader can leave the way they leave every other one. -->
		<div>
			<BackControl fallback={backFallback} />
		</div>

		<Empty.Root class="flex-1">
			<Empty.Header>
				<Empty.Title>{$LL.common.messages.noResults()}</Empty.Title>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<!-- the record and its own fields are one group, and the gap inside it is smaller than
		     the gap to the collection below: spacing is what says the fields belong to the record
		     rather than to the list (_Avoid ambiguous spacing_).

		     no panel behind any of it. Four treatments were prototyped and every one that put the
		     record on the page background beat the one that kept a filled slab — the slab spent a
		     third of the window on a name and left the fields reading as though they belonged to
		     nothing. -->
		<div class="flex shrink-0 flex-col gap-4">
			<header>
				<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
					<BackControl fallback={backFallback} />

					{#if actions}
						<div class="flex flex-wrap items-center justify-end gap-2">
							{@render actions()}
						</div>
					{/if}
				</div>

				<div class="mt-4 min-w-0 space-y-1 text-start">
					<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">{eyebrow}</p>
					<h1 class="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
					{#if identity}
						<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
							{@render identity()}
						</div>
					{/if}
				</div>
			</header>

			<!-- no inset of its own: the fields align with the header and the collection below,
			     which are the page's own edges. -->
			{#if fields}
				{@render fields()}
			{/if}
		</div>

		{#if isChoosable}
			<Tabs.Root bind:value={chosen} class="min-h-0 flex-1 gap-3">
				<Tabs.List class="shrink-0 self-start">
					{#each collections as collection (collection.value)}
						<!-- the chosen collection is marked by a value step rather than by the
						     primitive's solid `primary` fill: with the panel and the tiles gone there is
						     nothing else loud on the surface, and a filled switcher would lead a screen
						     nobody opened to change sections on. -->
						<Tabs.Trigger
							value={collection.value}
							class="capitalize data-[state=active]:bg-accent data-[state=active]:text-foreground"
						>
							{collection.label}
						</Tabs.Trigger>
					{/each}
				</Tabs.List>

				{#each collections as collection (collection.value)}
					<!-- a flex column, not merely a sized box: the panel is a block by default, so a
					     collection inside it asking for a share of the height resolves against nothing
					     and grows without bound — the list then runs past the window instead of
					     scrolling inside it, and anything pinned to its scroll edge has nothing to
					     pin against. Only a record with more than one collection takes this path,
					     which is why exactly one screen showed it. -->
					<Tabs.Content value={collection.value} class="flex min-h-0 flex-1 flex-col">
						{@render collection.content()}
					</Tabs.Content>
				{/each}
			</Tabs.Root>
		{:else if collections.length === 1}
			{@const only = collections[0]}
			<section class="flex min-h-0 flex-1 flex-col gap-3">
				{@render heading(only.label)}
				{@render only.content()}
			</section>
		{/if}
	{/if}
</PageFrame>
