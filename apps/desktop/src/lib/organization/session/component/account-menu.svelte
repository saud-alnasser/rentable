<script lang="ts">
	import type { OrganizationSession } from '$lib/organization/host';
	import { resolve } from '$app/paths';
	import * as Avatar from '@rentable/design/primitive/avatar/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import { THE_SETTINGS_AREA, withSection } from '$lib/settings';
	import { SECTION_GLYPH } from '$lib/settings/ui';
	import { accountInitials, requestSignOut } from '$lib/sync';
	import LogOutIcon from '@lucide/svelte/icons/log-out';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	/**
	 * Who this machine is signed in as, at the foot of the rail.
	 *
	 * **It replaced the settings link**, and took settings inside itself. The rail's two permanent
	 * rows now name the two things that are true before any screen is open: the workspace, and the
	 * person it belongs to. Settings is one row inside this menu because it is reached monthly and
	 * was occupying a place in the list of things reached hourly.
	 *
	 * **Settings, then the three sections the organization contributes to it, then the way out**
	 * (effort 851, at the human's word on 2026-10-06). Settings opens the area at its front, which
	 * is general; account, organization and workspaces each open the area on their own section, at
	 * the address the section switch and the command menu open it at. The area offers those three
	 * to anybody signed in (`sectionsFor`; none of them declares a `shows`), and this menu is drawn
	 * only while somebody is, so it offers all three and refuses nobody. A section that ever comes
	 * to be held back from a reader is held back here by the same answer. *Effort 826 took the
	 * section rows out, as a fourth route to sections already open at three; the human asked for
	 * them back, since the person at the foot of the rail is where they look for their account.*
	 *
	 * **Signing out lives here**, and in this machine's row of the account section. It asks
	 * nothing (effort 851, at the human's word on 2026-10-06: "sign out is simple, just sign
	 * out"), since signing in again undoes it; it announces itself and the layout is what
	 * answers, putting the wall up in place, because this component is about to be behind it.
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

	/** physical, not logical, so it is computed. `workspace/component/menu.svelte` has the same note. */
	const side = $derived(
		sidebar.presentsAsDrawer
			? 'bottom'
			: localesMetadata[$locale].direction === 'rtl'
				? 'left'
				: 'right'
	);

	const initials = $derived(accountInitials(session.username));

	/** the sections the organization contributes to the settings area, in the area's order. */
	const sections = ['account', 'organization', 'workspaces'] as const;
</script>

{#snippet identity()}
	<Avatar.Root class="size-8 shrink-0 rounded-lg">
		<Avatar.Fallback class="rounded-lg text-xs">{initials}</Avatar.Fallback>
	</Avatar.Root>
	<div class="grid flex-1 text-start text-sm leading-tight">
		<span class="truncate font-medium">{session.username}</span>
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

				<!-- settings and its three sections, one group, since each is a door to the same
				     area; then the way out, set apart because it is the one row that is not a place. -->
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a href={resolve(THE_SETTINGS_AREA)} data-account-menu-settings {...props}>
							<SettingsIcon class="size-4 shrink-0" />
							<span class="capitalize">{$LL.common.nav.settings()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>

				{#each sections as section (section)}
					{@const Glyph = SECTION_GLYPH[section]}
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a
								href={resolve(withSection(section))}
								data-account-menu-section={section}
								{...props}
							>
								<Glyph class="size-4 shrink-0" />
								<span class="capitalize">{$LL.settings.section[section]()}</span>
							</a>
						{/snippet}
					</DropdownMenu.Item>
				{/each}

				<DropdownMenu.Separator />

				<!-- no question: signing in again undoes it (effort 851). The shell owns the wall, so
				     the menu asks and the shell signs out; nothing is awaited here. -->
				<DropdownMenu.Item onSelect={() => requestSignOut()} data-account-menu-sign-out>
					<LogOutIcon class="size-4 shrink-0" />
					<span class="capitalize">
						{$LL.common.actions.signOut()}
					</span>
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
