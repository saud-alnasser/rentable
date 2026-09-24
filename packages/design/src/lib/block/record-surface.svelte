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
	import { back } from '#lib/back.svelte.js';
	import BackControl from '#lib/block/back-control.svelte';
	import Empty from '#lib/block/empty.svelte';
	import Loading from '#lib/block/loading.svelte';
	import PageFrame from '#lib/block/page-frame.svelte';
	import SectionSwitch from '#lib/block/section-switch.svelte';
	import { Button } from '#lib/primitive/button/index.js';
	import { Skeleton } from '#lib/primitive/skeleton/index.js';
	import { shownRecord } from '#lib/shown-record.svelte.js';
	import { useDesignContract } from '#lib/strings.js';

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
		section
	}: {
		/** Whether the record is still on its way. */
		isLoading?: boolean;
		/** Whether the record was found. A surface that is neither found nor loading says so. */
		found?: boolean;
		/** Where back goes when the reader arrived here from nowhere: the concept's directory,
		    already resolved. */
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
		/**
		 * The collection the address names, read from `?section=` by the route. One the record
		 * does not have, and none at all, draw the first.
		 */
		section?: string | null;
	} = $props();

	const contract = useDesignContract();

	// only a record with something to choose between puts a choice in the address; the rest have
	// nothing to say there, and four of the five used to say it anyway.
	const isChoosable = $derived(collections.length > 1);
	const defaultCollection = $derived(collections[0]?.value ?? '');
	const chosen = $derived(
		collections.find((collection) => collection.value === section)?.value ?? defaultCollection
	);

	// the first collection is the record's own address, so the address a reader arrives on with no
	// section and the one the switch writes for the first are the same address.
	const switchable = $derived(
		collections.map((collection) => ({
			value: collection.value,
			label: collection.label,
			href: collection.value === defaultCollection ? path : `${path}?section=${collection.value}`
		}))
	);

	// the chrome above names the record this surface is showing, and only once it knows whether
	// there is one: nothing while it loads, the record's name once found, and `null` where the
	// record is not there. Taken back when the surface goes.
	$effect(() => {
		shownRecord.name = isLoading ? undefined : found ? title : null;

		return () => {
			shownRecord.name = undefined;
		};
	});
</script>

{#snippet heading(text: string)}
	<h2 class="shrink-0 text-xs text-muted-foreground uppercase">{text}</h2>
{/snippet}

<!-- fills: a record's collections scroll inside their own panel, which they cannot do unless the
     frame above them is exactly as tall as the window. -->
<PageFrame fills>
	<Loading loading={isLoading} label={contract.strings.loadingRecord} class="flex flex-col gap-4">
		<!-- the shape of the header every record draws: the back control and the action cluster on
		     one line, then the eyebrow, the name and the identity beneath it, then the fields. -->
		{#snippet skeleton()}
			<div class="flex items-start justify-between gap-3">
				<Skeleton class="size-8 rounded-full" />
				<Skeleton class="h-8 w-32 rounded-full" />
			</div>
			<div class="space-y-2">
				<Skeleton class="h-3 w-20" />
				<Skeleton class="h-8 w-64 max-w-full" />
				<Skeleton class="h-4 w-40" />
			</div>
			<Skeleton class="h-24 w-full rounded-xl" />
		{/snippet}

		{#if !found}
			<!-- the back control keeps its usual place, so a record that is not there is still a
			     screen the reader can leave the way they leave every other one. -->
			<div>
				<BackControl fallback={backFallback} />
			</div>

			<!-- that the record does not exist, never that a search found nothing: nothing was
			     searched. The labelled way back beneath it goes where the back control goes, for a
			     reader whose eye lands on the sentence rather than on the corner. -->
			<Empty
				kind="not-found"
				title={contract.strings.recordNotFound}
				description={contract.strings.recordNotFoundDescription}
				class="flex-1"
			>
				{#snippet action()}
					<Button variant="outline" size="sm" onclick={() => void back.go(backFallback)}>
						{contract.strings.goBack}
					</Button>
				{/snippet}
			</Empty>
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
					<!-- a plain row: the frame's direction already puts the back control at the start
					     edge and the actions at the end, in either reading direction. A reverse under
					     `rtl:` would flip it back, putting the back control on the left in Arabic with
					     its mirrored arrow pointing away from the edge it sits on. -->
					<div class="flex items-start justify-between gap-3">
						<BackControl fallback={backFallback} />

						{#if actions}
							<div class="flex flex-wrap items-center justify-end gap-2">
								{@render actions()}
							</div>
						{/if}
					</div>

					<div class="mt-4 min-w-0 space-y-1 text-start">
						<p class="text-xs text-muted-foreground uppercase">{eyebrow}</p>
						<h1 class="truncate text-2xl font-semibold sm:text-3xl">{title}</h1>
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
				{@const shown = collections.find((collection) => collection.value === chosen)}
				<div class="flex min-h-0 flex-1 flex-col gap-3">
					<SectionSwitch sections={switchable} current={chosen} label={title} />

					<!-- a flex column, not merely a sized box: a collection asking for a share of the
					     height resolves against nothing otherwise and grows without bound, so the list
					     runs past the window instead of scrolling inside it, and anything pinned to its
					     scroll edge has nothing to pin against. -->
					{#if shown}
						<section
							class="flex min-h-0 flex-1 flex-col"
							aria-label={shown.label}
							data-collection={shown.value}
						>
							{@render shown.content()}
						</section>
					{/if}
				</div>
			{:else if collections.length === 1}
				{@const only = collections[0]}
				<section class="flex min-h-0 flex-1 flex-col gap-3">
					{@render heading(only.label)}
					{@render only.content()}
				</section>
			{/if}
		{/if}
	</Loading>
</PageFrame>
