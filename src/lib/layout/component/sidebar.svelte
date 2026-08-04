<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { isActiveRoute } from '$lib/layout/navigation';
	import { type Icon } from '@tabler/icons-svelte';
	import ContractIcon from '@tabler/icons-svelte/icons/contract';
	import Home2Icon from '@tabler/icons-svelte/icons/home-2';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserIcon from '@tabler/icons-svelte/icons/user';
	import type { ComponentProps } from 'svelte';

	type Item = { label: () => string; icon: Icon; url: Pathname };

	const primary: Item[] = [
		{ label: () => $LL.common.nav.dashboard(), icon: InnerShadowTopIcon, url: '/' },
		{ label: () => $LL.common.nav.tenants(), icon: UserIcon, url: '/tenants' },
		{ label: () => $LL.common.nav.complexes(), icon: Home2Icon, url: '/complexes' },
		{ label: () => $LL.common.nav.contracts(), icon: ContractIcon, url: '/contracts' }
	];

	const secondary: Item[] = [
		{ label: () => $LL.common.nav.settings(), icon: SettingsIcon, url: '/settings' }
	];

	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();
</script>

{#snippet links(items: Item[])}
	<Sidebar.Menu>
		{#each items as item (item.url)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton
					isActive={isActiveRoute(page.url.pathname, item.url)}
					tooltipContent={item.label()}
				>
					{#snippet child({ props })}
						<a href={resolve(item.url)} {...props}>
							<item.icon />
							<span class="capitalize">{item.label()}</span>
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
			{@render links(primary)}
		</nav>
	</Sidebar.Content>

	<Sidebar.Footer>
		{@render links(secondary)}
	</Sidebar.Footer>
</Sidebar.Root>
