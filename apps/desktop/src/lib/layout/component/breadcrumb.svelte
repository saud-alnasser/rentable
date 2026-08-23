<script lang="ts">
	import { page } from '$app/state';
	import * as Breadcrumb from '@rentable/design/primitive/breadcrumb/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { toBreadcrumbTrail } from '$lib/layout/navigation';

	function localizeSegment(segment: string) {
		switch (segment) {
			case 'account':
				return $LL.common.nav.account();
			case 'complexes':
				return $LL.common.nav.complexes();
			case 'contracts':
				return $LL.common.nav.contracts();
			case 'dashboard':
				return $LL.common.nav.dashboard();
			case 'payments':
				return $LL.common.nav.payments();
			case 'settings':
				return $LL.common.nav.settings();
			case 'tenants':
				return $LL.common.nav.tenants();
			case 'workspace':
				return $LL.common.nav.workspace();
			case 'units':
				return $LL.common.nav.units();
			default:
				return segment;
		}
	}

	const crumbs = $derived(toBreadcrumbTrail(page.url.pathname));
</script>

<Breadcrumb.Root>
	<Breadcrumb.List>
		{#each crumbs as crumb (crumb.path)}
			<Breadcrumb.Item>
				{#if crumb.isLast}
					<Breadcrumb.Page class="capitalize">{localizeSegment(crumb.segment)}</Breadcrumb.Page>
				{:else}
					<Breadcrumb.Link href={crumb.path} class="capitalize">
						{localizeSegment(crumb.segment)}
					</Breadcrumb.Link>
				{/if}
			</Breadcrumb.Item>

			{#if !crumb.isLast}
				<Breadcrumb.Separator />
			{/if}
		{/each}
	</Breadcrumb.List>
</Breadcrumb.Root>
