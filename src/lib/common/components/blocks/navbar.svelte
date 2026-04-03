<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { type Icon } from '@tabler/icons-svelte';
	import ContractIcon from '@tabler/icons-svelte/icons/contract';
	import Home2Icon from '@tabler/icons-svelte/icons/home-2';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserIcon from '@tabler/icons-svelte/icons/user';

	type Item = { label: () => string; icon: Icon; url: Pathname };

	const items: Item[] = [
		{
			label: () => $LL.common.nav.dashboard(),
			icon: InnerShadowTopIcon,
			url: '/'
		},
		{
			label: () => $LL.common.nav.tenants(),
			icon: UserIcon,
			url: '/tenants'
		},
		{
			label: () => $LL.common.nav.complexes(),
			icon: Home2Icon,
			url: '/complexes'
		},
		{
			label: () => $LL.common.nav.contracts(),
			icon: ContractIcon,
			url: '/contracts'
		},
		{
			label: () => $LL.common.nav.settings(),
			icon: SettingsIcon,
			url: '/settings'
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
	aria-label={$LL.common.nav.primary()}
	class="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4"
	dir="ltr"
>
	<div
		class="pointer-events-auto flex items-center gap-1.5 rounded-[1.6rem] border border-border/60 bg-background/56 p-2 shadow-lg backdrop-blur-xl"
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
							aria-label={item.label()}
							aria-current={isActive(item.url) ? 'page' : undefined}
							class={cn(
								'rounded-[1rem] border border-transparent bg-transparent text-muted-foreground hover:border-border/50 hover:bg-background/60 hover:text-foreground',
								isActive(item.url) && 'border-primary/15 bg-primary/10 text-primary'
							)}
						>
							<item.icon class="size-5" />
							<span class="sr-only">{item.label()}</span>
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="top" sideOffset={8}>
					{item.label()}
				</Tooltip.Content>
			</Tooltip.Root>
		{/each}
	</div>
</nav>
