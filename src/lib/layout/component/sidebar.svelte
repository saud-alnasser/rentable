<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		primaryDestinations,
		secondaryDestinations,
		type Destination
	} from '$lib/layout/destination';
	import { isActiveRoute } from '$lib/layout/navigation';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();
</script>

{#snippet links(items: Destination[])}
	<Sidebar.Menu>
		{#each items as item (item.url)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					isActive={isActiveRoute(page.url.pathname, item.url)}
					tooltipContent={item.label($LL)}
				>
					{#snippet child({ props })}
						<a href={resolve(item.url)} {...props}>
							<item.icon />
							<span class="capitalize">{item.label($LL)}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
{/snippet}

<Sidebar.Root bind:ref {collapsible} variant="inset" {...restProps}>
	<Sidebar.Header class="h-12 justify-center">
		<div class="flex items-center gap-2 px-2">
			<InnerShadowTopIcon class="size-4 shrink-0 text-muted-foreground" />
			<span
				class="truncate text-sm font-semibold tracking-[0.04em] capitalize group-data-[collapsible=icon]:hidden"
			>
				{$LL.app.name()}
			</span>
		</div>
	</Sidebar.Header>

	<Sidebar.Content>
		<nav aria-label={$LL.common.nav.primary()}>
			{@render links(primaryDestinations)}
		</nav>
	</Sidebar.Content>

	<Sidebar.Footer>
		{@render links(secondaryDestinations)}
	</Sidebar.Footer>
</Sidebar.Root>
