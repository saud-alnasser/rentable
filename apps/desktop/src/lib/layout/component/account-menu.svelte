<script lang="ts">
	import type { RemoteSyncAccount } from '$lib/platform/host';
	import { resolve } from '$app/paths';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { toErrorText } from '$lib/error/message';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { accountInitials } from '$lib/sync/account';
	import { signOutOfGoogle } from '$lib/sync/sign-in';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserCircleIcon from '@tabler/icons-svelte/icons/user-circle';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import { toast } from 'svelte-sonner';

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
	let { account }: { account: RemoteSyncAccount } = $props();

	const sidebar = useSidebar();

	/** physical, not logical, so it is computed. `workspace-menu` has the same note. */
	const side = $derived(
		sidebar.presentsAsDrawer
			? 'bottom'
			: localesMetadata[$locale].direction === 'rtl'
				? 'left'
				: 'right'
	);

	const initials = $derived(accountInitials(account.displayName || account.email));

	let isSigningOut = $state(false);

	async function signOut() {
		if (isSigningOut) {
			return;
		}

		isSigningOut = true;

		try {
			await signOutOfGoogle();
		} catch (error) {
			toast.error(toErrorText(error, $LL, $LL.common.errors.internal()));
		} finally {
			isSigningOut = false;
		}
	}
</script>

{#snippet identity()}
	<Avatar.Root class="size-8 shrink-0 rounded-lg">
		{#if account.avatarImage}
			<Avatar.Image src={account.avatarImage} alt={account.displayName} />
		{/if}
		<Avatar.Fallback class="rounded-lg text-xs">{initials}</Avatar.Fallback>
	</Avatar.Root>
	<div class="grid flex-1 text-start text-sm leading-tight">
		<span class="truncate font-medium">{account.displayName}</span>
		<!-- the address is the account's, not the reader's language: isolating it keeps an ltr
		     address from reordering the arabic around it. -->
		<span class="truncate text-xs text-muted-foreground" dir="ltr">{account.email}</span>
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

				<DropdownMenu.Item disabled={isSigningOut} onSelect={() => void signOut()}>
					<LogOutIcon class="size-4 shrink-0" />
					<span>
						{isSigningOut ? $LL.common.actions.working() : $LL.common.actions.signOut()}
					</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
