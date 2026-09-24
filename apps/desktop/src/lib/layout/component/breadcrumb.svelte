<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Breadcrumb from '@rentable/design/primitive/breadcrumb/index.js';
	import { shownRecord } from '@rentable/design/shown-record.svelte.js';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toBreadcrumbTrail, type TrailPlace } from '$lib/layout/navigation';

	/**
	 * Where the reader is: the places above this page, and the record it ends on.
	 *
	 * Every place is named here, one entry to each, so a place the trail can hold and nothing
	 * names does not compile. The record is named by the record surface showing it, which is the
	 * only thing that knows what a record is called; until it says, the trail ends on the place
	 * above it, and a record that is not there is named as unknown.
	 */
	const placeNames: Record<TrailPlace, (t: TranslationFunctions) => string> = {
		'/tenants': (t) => t.common.nav.tenants(),
		'/complexes': (t) => t.common.nav.complexes(),
		'/contracts': (t) => t.common.nav.contracts(),
		'/settings': (t) => t.common.nav.settings()
	};

	const crumbs = $derived(
		toBreadcrumbTrail(page.route.id).filter(
			(crumb) => crumb.kind === 'place' || shownRecord.name !== undefined
		)
	);
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#each crumbs as crumb, index (crumb.route)}
			{#if index > 0}
				<Breadcrumb.Separator />
			{/if}

			<Breadcrumb.Item>
				{#if crumb.kind === 'record'}
					<Breadcrumb.Page class="max-w-48 truncate">
						{shownRecord.name ?? $LL.common.messages.unknown()}
					</Breadcrumb.Page>
				{:else if crumb.isLast}
					<Breadcrumb.Page class="capitalize">{placeNames[crumb.route]($LL)}</Breadcrumb.Page>
				{:else}
					<Breadcrumb.Link href={resolve(crumb.route)} class="capitalize">
						{placeNames[crumb.route]($LL)}
					</Breadcrumb.Link>
				{/if}
			</Breadcrumb.Item>
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>
