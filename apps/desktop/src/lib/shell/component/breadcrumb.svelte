<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Breadcrumb from '@rentable/design/primitive/breadcrumb/index.js';
	import { shownRecord } from '@rentable/design/shown-record.svelte.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { places } from '$lib/app/surfaces';
	import { toBreadcrumbTrail } from '$lib/shell/navigation';

	/**
	 * Where the reader is: the places above this page, and the record it ends on.
	 *
	 * A place is named by the surface declaring it, by the place on its route that opens no address
	 * of its own (a section of the page is a destination, not the page). The record is named by the
	 * record surface showing it, which is the only thing that knows what a record is called; until it
	 * says, the trail ends on the place above it, and a record that is not there is named as unknown.
	 * A record reached through another has that one named and addressed by the same surface, and
	 * its crumb waits on the surface as the record's does.
	 */
	const placeNames = new Map(
		places.filter((place) => !place.url).map((place) => [place.route, place.label])
	);

	const crumbs = $derived(
		toBreadcrumbTrail(page.route.id).filter((crumb) => {
			switch (crumb.kind) {
				case 'place':
					return true;
				case 'parent':
					return shownRecord.parent !== undefined;
				case 'record':
					return shownRecord.name !== undefined;
			}
		})
	);
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#each crumbs as crumb, index (crumb.route)}
			{#if index > 0}
				<Breadcrumb.Separator />
			{/if}

			<Breadcrumb.Item>
				{#if crumb.kind === 'parent'}
					{#if shownRecord.parent}
						<!-- a record's name, and an address its surface already resolved. -->
						<Breadcrumb.Link
							href={shownRecord.parent.href}
							class="max-w-48 truncate"
							data-crumb-parent
						>
							<bdi>{shownRecord.parent.name}</bdi>
						</Breadcrumb.Link>
					{/if}
				{:else if crumb.kind === 'record'}
					<Breadcrumb.Page class="max-w-48 truncate">
						<!-- the record's name is what somebody typed, so it keeps its own direction. -->
						<bdi>{shownRecord.name ?? $LL.common.messages.unknown()}</bdi>
					</Breadcrumb.Page>
				{:else if crumb.isLast}
					<Breadcrumb.Page class="capitalize">{placeNames.get(crumb.route)?.($LL)}</Breadcrumb.Page>
				{:else}
					<Breadcrumb.Link href={resolve(crumb.route)} class="capitalize">
						{placeNames.get(crumb.route)?.($LL)}
					</Breadcrumb.Link>
				{/if}
			</Breadcrumb.Item>
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>
