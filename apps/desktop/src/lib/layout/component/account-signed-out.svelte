<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { useSidebar } from '$lib/design/primitive/sidebar';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import UserIcon from '@tabler/icons-svelte/icons/user';

	/**
	 * The account control with nobody signed in, at the foot of the rail.
	 *
	 * **The way into the application, and the reason the rail is drawn before anybody signs in at
	 * all.** *Chosen 2026-08-20; it was in none of the four shells that were looked at, and came
	 * out of the human looking at the one that put a sign-in row here and wanting less of it.*
	 *
	 * **It is the same control as `account-menu.svelte` rather than a different one**, which is
	 * the whole claim: the shell does not change shape when somebody signs in, its contents fill
	 * in. An empty user glyph stands where the picture will be, in the same geometry, opening a
	 * menu in the same place.
	 *
	 * **The menu is two rows and the provider is named in neither.** Signing in says only that,
	 * because the card on the other side of it is where Google is named and this row would
	 * otherwise say it first.
	 *
	 * **The row reaches the card and signs nobody in.** *Corrected 2026-08-22 (#735).* Until then it
	 * called `startup.signIn()`, which opened the consent screen from a menu row. On `/settings`,
	 * the one address that draws signed out, that meant the card naming the provider was never seen
	 * at all. It now leaves for an address the card draws over, and the button on the card is what
	 * starts the flow.
	 */
	let { onWayIn }: { onWayIn: () => void } = $props();

	const sidebar = useSidebar();

	/** physical in bits-ui, so it is computed. `account-menu` has the same note. */
	const side = $derived(
		sidebar.presentsAsDrawer
			? 'bottom'
			: localesMetadata[$locale].direction === 'rtl'
				? 'left'
				: 'right'
	);
</script>

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
						<Avatar.Root class="size-8 shrink-0 rounded-lg">
							<Avatar.Fallback class="rounded-lg text-muted-foreground">
								<UserIcon class="size-4" />
							</Avatar.Fallback>
						</Avatar.Root>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-medium">{$LL.layout.accountMenu.signedOutName()}</span>
							<span class="truncate text-xs text-muted-foreground">
								{$LL.layout.accountMenu.signedOutHint()}
							</span>
						</div>
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
				<DropdownMenu.Item onSelect={onWayIn}>
					<LogInIcon class="size-4 shrink-0" />
					<span>{$LL.layout.accountMenu.signIn()}</span>
				</DropdownMenu.Item>

				<DropdownMenu.Separator />

				<!-- the row requirement 9a exists for: offering settings from here and then refusing
				     to open it is a menu with a broken item in it. -->
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a href={resolve('/settings')} {...props}>
							<SettingsIcon class="size-4 shrink-0" />
							<span class="capitalize">{$LL.common.nav.settings()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
