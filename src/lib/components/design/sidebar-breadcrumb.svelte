<script lang="ts">
	import { page } from '$app/state';
	import { Separator } from '$lib/components/fragments/separator';
	import * as Sidebar from '$lib/components/fragments/sidebar';
	import { regex } from '$lib/utils/regex';
	import * as Breadcrumb from '../fragments/breadcrumb';

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

				return { label: segment, path };
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
				{#each crumbs() as crumb, index}
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
