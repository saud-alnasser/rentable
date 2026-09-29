<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { SIDEBAR_KEYBOARD_SHORTCUT } from '@rentable/design/primitive/sidebar/constants.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { shortcuts } from '$lib/shortcut';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { slotsAt } from '$lib/app/surfaces';
	import { primaryDestinations, type Destination } from '$lib/shell/destination';
	import { isActiveRoute, toViewablePlaces } from '$lib/shell/navigation';
	import { memberPermissions } from '$lib/permission';
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
	 * `startup/component/root.svelte` renders the full rail only at `startupState === 'ready'`, which is past
	 * admission, so an account is held and a workspace is open whenever that is drawn; the startup
	 * path also writes the state into the sync query's key before the shell mounts, so there is no
	 * first frame with nothing in it.
	 *
	 * **The two rows are the features' own, drawn at the shell's two places** (`workspace-menu` and
	 * `account-menu`, in `$lib/feature/surface`): the workspace's at the top and the account's at
	 * the foot, each read off `app/surfaces` in the list's order. The rail hands each what only the
	 * frame knows, which state it is in and what a switch or the way in runs, and each reads what it
	 * shows for itself.
	 */
	let {
		ref = $bindable(null),
		collapsible = 'icon',
		signedOut = false,
		onWayIn = () => {},
		onSwitchWorkspace = () => {},
		...restProps
	}: ComponentProps<typeof Sidebar.Root> & {
		/** whether this is the rail before anybody has signed in. */
		signedOut?: boolean;
		/**
		 * the way in, offered by the account row. **It reaches the sign-in card rather than signing
		 * anybody in**: the card is where the provider is named, and a row that went straight to the
		 * consent screen would be the way in past the one surface that says what it is. Only read
		 * while `signedOut`.
		 */
		onWayIn?: () => void;
		/**
		 * a switch to another workspace, handed down by the root layout, which holds the startup
		 * unit. A switch is the sign-in path run again past the wall, under the loading surface, and
		 * that path is the unit's; the rail asks for it and draws whatever the unit reports, the way
		 * every other surface beside the wall does.
		 */
		onSwitchWorkspace?: (workspaceId: string) => void;
	} = $props();

	const workspaceRows = slotsAt('workspace-menu');
	const accountRows = slotsAt('account-menu');

	const sidebar = Sidebar.useSidebar();

	/**
	 * The key that folds and unfolds this rail.
	 *
	 * Registered rather than listened for: the keydown reaches the application's one listener, and
	 * the shortcut sheet and the palette read what is registered without being told about it.
	 *
	 * **It is registered here rather than by the primitive that owns the state.** It was an
	 * `$effect` inside `SidebarState` until the sidebar crossed into `@rentable/design`, and it
	 * could not go with it: a registration describes itself out of `TranslationFunctions`, which is
	 * this application's generated type, so the package would have been naming keys in a dictionary
	 * it cannot see. The key itself stays with the primitive, as `SIDEBAR_KEYBOARD_SHORTCUT`, so
	 * there is still one place it is written down.
	 *
	 * This component is drawn exactly where `Sidebar.Provider` is, so the registration lives and
	 * dies with the state it runs against, as it did before.
	 */
	$effect(() =>
		shortcuts.register({
			id: 'sidebar.toggle',
			scope: 'application',
			keys: [{ key: SIDEBAR_KEYBOARD_SHORTCUT, command: true }],
			describe: (translations) => translations.common.ui.toggleSidebar(),
			run: sidebar.toggle
		})
	);
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
		{#each workspaceRows as WorkspaceRow, index (index)}
			<WorkspaceRow {signedOut} onSwitch={onSwitchWorkspace} />
		{/each}
	</Sidebar.Header>

	<Sidebar.Content>
		<nav aria-label={$LL.common.nav.primary()}>
			{@render links(toViewablePlaces(primaryDestinations, memberPermissions.views))}
		</nav>
	</Sidebar.Content>

	<Sidebar.Footer>
		{#each accountRows as AccountRow, index (index)}
			<AccountRow {signedOut} {onWayIn} />
		{/each}
	</Sidebar.Footer>
</Sidebar.Root>
