<script lang="ts">
	import type { OrganizationSession } from '$lib/platform/host';
	import { resolve } from '$app/paths';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { accountInitials } from '$lib/sync/account';
	import { requestSignOut } from '$lib/sync/sign-out';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserCircleIcon from '@tabler/icons-svelte/icons/user-circle';
	import UsersGroupIcon from '@tabler/icons-svelte/icons/users-group';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	/**
	 * Who this machine is signed in as, at the foot of the rail.
	 *
	 * **It replaced the settings link**, and took settings inside itself. The rail's two permanent
	 * rows now name the two things that are true before any screen is open: the workspace, and the
	 * person it belongs to. Settings is one row inside this menu because it is reached monthly and
	 * was occupying a place in the list of things reached hourly.
	 *
	 * **Signing out lives here and nowhere else.** It used to be a row in the settings page's
	 * account group, which made settings the door for identity as well as the place for
	 * preferences. The call is unchanged, including its refusal to do anything with the state it
	 * gets back: signing out announces itself and the layout is what answers, because this
	 * component is about to be behind the wall it raises.
	 *
	 * **The picture is drawn from bytes this machine holds** (#630), never from Google's URL, so
	 * this row looks the same offline as online. Initials stand in where an account has none.
	 */
	/**
	 * who is in: the member whose vault opened, as the shell holds them. *It was a Google account
	 * row until the control plane retired; the name and the address are the organization's now,
	 * opened with the content key, and there is no picture.*
	 */
	let { session }: { session: OrganizationSession } = $props();

	const sidebar = useSidebar();

	/** physical, not logical, so it is computed. `workspace-menu` has the same note. */
	const side = $derived(
		sidebar.presentsAsDrawer
			? 'bottom'
			: localesMetadata[$locale].direction === 'rtl'
				? 'left'
				: 'right'
	);

	const initials = $derived(accountInitials(session.username || session.organizationName));

	// the shell owns the wall, so the menu asks and the shell signs out; nothing is awaited here.
	const signOut = () => requestSignOut();
</script>

{#snippet identity()}
	<Avatar.Root class="size-8 shrink-0 rounded-lg">
		<Avatar.Fallback class="rounded-lg text-xs">{initials}</Avatar.Fallback>
	</Avatar.Root>
	<div class="grid flex-1 text-start text-sm leading-tight">
		<span class="truncate font-medium">{session.username || session.organizationName}</span>
	</div>
{/snippet}

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton
						{...props}
						size="lg"
						class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
					>
						{@render identity()}
						<ChevronsUpDownIcon class="ms-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
				align="end"
				{side}
				sideOffset={4}
			>
				<!-- the same pair the trigger shows, repeated as the menu's own heading: collapsed to
				     the icon rail the trigger is an avatar and nothing else, so this is where the
				     name and the address are read. -->
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
						{@render identity()}
					</div>
				</DropdownMenu.Label>

				<DropdownMenu.Separator />

				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a href={resolve('/organization')} {...props}>
							<UsersGroupIcon class="size-4 shrink-0" />
							<span class="capitalize">{$LL.common.nav.organization()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>

				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a href={resolve('/account')} {...props}>
							<UserCircleIcon class="size-4 shrink-0" />
							<span class="capitalize">{$LL.common.nav.account()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>

				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a href={resolve('/settings')} {...props}>
							<SettingsIcon class="size-4 shrink-0" />
							<span class="capitalize">{$LL.common.nav.settings()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>

				<DropdownMenu.Separator />

				<DropdownMenu.Item onSelect={signOut}>
					<LogOutIcon class="size-4 shrink-0" />
					<span>
						{$LL.common.actions.signOut()}
					</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
