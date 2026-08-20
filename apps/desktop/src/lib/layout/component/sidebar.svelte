<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LayoutAccountMenu from '$lib/layout/component/account-menu.svelte';
	import LayoutWorkspaceMenu from '$lib/layout/component/workspace-menu.svelte';
	import { primaryDestinations, type Destination } from '$lib/layout/destination';
	import { isActiveRoute } from '$lib/layout/navigation';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import { signedInAccount } from '$lib/sync/account';
	import type { ComponentProps } from 'svelte';

	/**
	 * The rail, and the two things it says before any screen is open.
	 *
	 * **The workspace is at the top and the account at the bottom**, each opening its own menu.
	 * They replaced a static mark with the product's name and a link called settings, which spent
	 * the two rows that are on screen at every moment on a logo and a route.
	 *
	 * **Neither can be empty, and neither carries a loading state.** `+layout.svelte` renders
	 * navigation only at `startupState === 'ready'`, which is past admission, so an account is
	 * held and a workspace is open whenever this is drawn; the startup path also writes the state
	 * into this query's key before the shell mounts, so there is no first frame with nothing in
	 * it. The guards below are the type system's, not a state anybody reaches.
	 */
	let {
		ref = $bindable(null),
		collapsible = 'icon',
		...restProps
	}: ComponentProps<typeof Sidebar.Root> = $props();

	const remoteSyncQuery = useFetchRemoteSyncState();

	const workspace = $derived(remoteSyncQuery.data?.workspace);
	const account = $derived(signedInAccount(remoteSyncQuery.data));
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
	<Sidebar.Header>
		{#if workspace}
			<!-- one member, because an account owns exactly one workspace and is created with it.
			     It is passed rather than assumed inside the control, so the day a route lists
			     members the number arrives from the same place the list does. -->
			<LayoutWorkspaceMenu {workspace} memberCount={account ? 1 : 0} />
		{/if}
	</Sidebar.Header>

	<Sidebar.Content>
		<nav aria-label={$LL.common.nav.primary()}>
			{@render links(primaryDestinations)}
		</nav>
	</Sidebar.Content>

	<Sidebar.Footer>
		{#if account}
			<LayoutAccountMenu {account} />
		{/if}
	</Sidebar.Footer>
</Sidebar.Root>
