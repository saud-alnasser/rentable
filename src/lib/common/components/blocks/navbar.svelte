<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { type Icon } from '@tabler/icons-svelte';
	import ContractIcon from '@tabler/icons-svelte/icons/contract';
	import Home2Icon from '@tabler/icons-svelte/icons/home-2';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import UserIcon from '@tabler/icons-svelte/icons/user';

	type Item = { label: string; icon: Icon; url: Pathname };

	const items: Item[] = [
		{
			label: 'dashboard',
			icon: InnerShadowTopIcon,
			url: '/'
		},
		{
			label: 'tenants',
			icon: UserIcon,
			url: '/tenants'
		},
		{
			label: 'complexes',
			icon: Home2Icon,
			url: '/complexes'
		},
		{
			label: 'contracts',
			icon: ContractIcon,
			url: '/contracts'
		}
	];

	function isActive(url: Pathname) {
		const pathname = page.url.pathname;

		if (url === '/') {
			return pathname === '/';
		}

		return pathname === url || pathname.startsWith(`${url}/`);
	}

	function navigateTo(event: MouseEvent, url: Pathname) {
		event.preventDefault();
		void goto(resolve(url));
	}
</script>

<nav
	aria-label="Primary"
	class="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
>
	<div
		class="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/20 p-2 shadow-lg backdrop-blur-xl"
	>
		{#each items as item (item.label)}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							href={resolve(item.url)}
							onclick={(event) => navigateTo(event, item.url)}
							variant="ghost"
							size="icon-lg"
							aria-label={item.label}
							aria-current={isActive(item.url) ? 'page' : undefined}
							class={cn(
								'rounded-full border border-transparent bg-transparent text-muted-foreground hover:border-border/60 hover:bg-background/60 hover:text-foreground',
								isActive(item.url) && 'border-border/70 bg-background/80 text-foreground shadow-sm'
							)}
						>
							<item.icon class="size-5" />
							<span class="sr-only">{item.label}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}>
					{item.label}
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
</nav>
