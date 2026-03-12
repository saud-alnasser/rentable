<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Pathname } from '$app/types';
	import * as Sidebar from '$lib/common/components/fragments/sidebar';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { type Icon } from '@tabler/icons-svelte';
	import ContractIcon from '@tabler/icons-svelte/icons/contract';
	import Home2Icon from '@tabler/icons-svelte/icons/home-2';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserIcon from '@tabler/icons-svelte/icons/user';
	import type { ComponentProps } from 'svelte';

	type Item = { label: string; icon: Icon; url: Pathname };

	type Items = { head: Item; middle: Item[]; tail: Item[] };

	const items: Items = {
		head: {
			label: $LL.app.name(),
			icon: InnerShadowTopIcon,
			url: '/'
		},
		middle: [
			{
				label: $LL.common.nav.tenants(),
				icon: UserIcon,
				url: '/tenants'
			},
			{
				label: $LL.common.nav.complexes(),
				icon: Home2Icon,
				url: '/complexes'
			},
			{
				label: $LL.common.nav.contracts(),
				icon: ContractIcon,
				url: '/contracts'
			}
		],
		tail: [
			{
				label: $LL.common.nav.settings(),
				icon: SettingsIcon,
				url: '/settings'
			}
		]
	};

	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();
</script>

<Sidebar.Root {collapsible} variant="inset" {...restProps}>
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={items.head.label}>
					{#snippet child({ props })}
						<a href={resolve(items.head.url)} {...props}>
							<items.head.icon />
							<span class="text-base font-semibold capitalize">{items.head.label}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		{#each items.middle as item (item.label)}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={item.label}>
					{#snippet child({ props })}
						<a href={resolve(item.url)} {...props}>
							<item.icon />
							<span class="text-base font-semibold capitalize">{item.label}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer>
		<Sidebar.Menu>
			{#each items.tail as item (item.label)}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent={item.label}>
						{#snippet child({ props })}
							<a href={resolve(item.url)} {...props}>
								<item.icon />
								<span class="text-base font-semibold capitalize">{item.label}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			{/each}
		</Sidebar.Menu>
	</Sidebar.Footer>
</Sidebar.Root>
