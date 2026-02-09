<script lang="ts">
	import type { Pathname } from '$app/types';
	import * as Sidebar from '$lib/common/components/fragments/sidebar';
	import type { Icon } from '@tabler/icons-svelte';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserIcon from '@tabler/icons-svelte/icons/user';
	import type { ComponentProps } from 'svelte';

	type Item = { label: string; icon: Icon; url: Pathname };

	type Items = { head: Item; middle: Item[]; tail: Item[] };

	const items: Items = {
		head: {
			label: 'rentable',
			icon: InnerShadowTopIcon,
			url: '/'
		},
		middle: [
			{
				label: 'tenants',
				icon: UserIcon,
				url: '/tenants'
			}
		],
		tail: [
			{
				label: 'settings',
				icon: SettingsIcon,
				url: '/'
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
						<a href={items.head.url} {...props}>
							<items.head.icon />
							<span class="text-base font-semibold capitalize">{items.head.label}</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		{#each items.middle as item}
			<Sidebar.MenuItem>
				<Sidebar.MenuButton tooltipContent={item.label}>
					{#snippet child({ props })}
						<a href={item.url} {...props}>
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
			{#each items.tail as item}
				<Sidebar.MenuItem>
					<Sidebar.MenuButton tooltipContent={item.label}>
						{#snippet child({ props })}
							<a href={item.url} {...props}>
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
