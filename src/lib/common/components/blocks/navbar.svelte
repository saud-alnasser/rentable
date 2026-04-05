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
	class="pointer-events-none flex h-full max-w-full min-w-0 justify-center"
	dir="ltr"
>
	<div
		class="pointer-events-auto flex h-11 min-h-11 max-w-full min-w-0 items-center justify-center gap-1.5 px-2.5 [-webkit-app-region:drag]"
	>
		{#each items as item (item.label)}
			{@const active = isActive(item.url)}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							href={resolve(item.url)}
							onclick={(event) => navigateTo(event, item.url)}
							variant="ghost"
							size="icon-sm"
							aria-label={item.label()}
							aria-current={active ? 'page' : undefined}
							data-active={active ? 'true' : undefined}
							class={cn(
								'border-border/55 bg-background/50 shadow-none [-webkit-app-region:no-drag]',
								active && 'text-primary'
							)}
						>
							<item.icon class="size-3.5" />
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
