<script lang="ts">
	import { page } from '$app/state';
	import * as Breadcrumb from '$lib/common/components/fragments/breadcrumb';
	import { Separator } from '$lib/common/components/fragments/separator';
	import * as Sidebar from '$lib/common/components/fragments/sidebar';
	import { regex } from '$lib/common/utils/regex';
	import { LL } from '$lib/i18n/i18n-svelte';

	function localizeSegment(segment: string) {
		switch (segment) {
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
			case 'units':
				return $LL.common.nav.units();
			default:
				return segment;
		}
	}

	function isDynamic(segment: string) {
		return regex.identifier.numeric.test(segment) || regex.identifier.uuid.test(segment);
	}

	let crumbs = $derived(() => {
		const segments = page.url.pathname.split('/').filter(Boolean);

		let path = '';

		return segments
			.map((segment) => {
				path += `/${segment}`;

				if (isDynamic(segment)) return null;

				return { label: localizeSegment(segment), path };
			})
			.filter(Boolean)
			.map((crumb, index, arr) => ({ ...crumb, isLast: index === arr.length - 1 }));
	});
</script>

<header
	class="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
>
	<div class="flex items-center gap-2 px-4">
		<Sidebar.Trigger class="-ms-1" />
		{#if crumbs().length > 0}
			<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
		{/if}
		<Breadcrumb.Root>
			<Breadcrumb.List>
				{#each crumbs() as crumb, index (crumb.path)}
					<Breadcrumb.Item>
						{#if crumb.isLast}
							<Breadcrumb.Page>{crumb.label}</Breadcrumb.Page>
						{:else}
							<Breadcrumb.Link href={crumb.path}>{crumb.label}</Breadcrumb.Link>
						{/if}
					</Breadcrumb.Item>

					{#if !crumb.isLast && index < crumbs().length - 1}
						<Breadcrumb.Separator class="hidden md:block" />
					{/if}
				{/each}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	</div>
</header>
