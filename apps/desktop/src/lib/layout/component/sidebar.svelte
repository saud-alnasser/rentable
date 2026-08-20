<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LayoutAccountMenu from '$lib/layout/component/account-menu.svelte';
	import LayoutAccountSignedOut from '$lib/layout/component/account-signed-out.svelte';
	import LayoutWorkspaceLocked from '$lib/layout/component/workspace-locked.svelte';
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
	 * **It is drawn with nobody signed in too, and it is the same rail.** *Settled 2026-08-20 by
	 * looking at four alternatives.* Signing in is not a screen the application shows before
	 * itself: an application waiting for a person is running. So the rail is here, the two rows
	 * hold their places with what they can say, the destinations are present and refuse, and the
	 * account row is the way in. What changes between the two states is the contents, never the
	 * shape.
	 *
	 * **Neither row can be empty once signed in, and neither carries a loading state.**
	 * `+layout.svelte` renders the full rail only at `startupState === 'ready'`, which is past
	 * admission, so an account is held and a workspace is open whenever that is drawn; the startup
	 * path also writes the state into this query's key before the shell mounts, so there is no
	 * first frame with nothing in it.
	 */
	let {
		ref = $bindable(null),
		collapsible = 'icon',
		signedOut = false,
		onSignIn = () => {},
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & {
		/** whether this is the rail before anybody has signed in. */
		signedOut?: boolean;
		/** the way in, offered by the account row. Only read while `signedOut`. */
		onSignIn?: () => void;
	} = $props();

	// asking who is signed in on a machine where nobody is would be refused by design and
	// reported as a failure, so the rail that already knows the answer does not ask.
	const remoteSyncQuery = useFetchRemoteSyncState(() => !signedOut);

	const workspace = $derived(remoteSyncQuery.data?.workspace);
	const account = $derived(signedInAccount(remoteSyncQuery.data));
</script>

{#snippet links(items: Destination[])}
	<Sidebar.Menu>
		{#each items as item (item.url)}
			<Sidebar.MenuItem>
				{#if signedOut}
					<!-- present and refusing, rather than absent. A destination that is missing while
					     signed out and appears afterwards makes signing in look like arriving at a
					     different application. -->
					<Sidebar.MenuButton aria-disabled="true" tooltipContent={item.label($LL)}>
						<item.icon />
						<span class="capitalize">{item.label($LL)}</span>
					</Sidebar.MenuButton>
				{:else}
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
				{/if}
			</Sidebar.MenuItem>
		{/each}
	</Sidebar.Menu>
{/snippet}

<Sidebar.Root bind:ref {collapsible} variant="inset" {...restProps}>
	<Sidebar.Header>
		{#if signedOut}
			<LayoutWorkspaceLocked />
		{:else if workspace}
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
		{#if signedOut}
			<LayoutAccountSignedOut {onSignIn} />
		{:else if account}
			<LayoutAccountMenu {account} />
		{/if}
	</Sidebar.Footer>
</Sidebar.Root>
