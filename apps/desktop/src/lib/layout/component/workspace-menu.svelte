<script lang="ts">
	import type { RemoteSyncWorkspace } from '$lib/platform/host';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	/**
	 * The workspace this machine has open, at the top of the rail.
	 *
	 * **It replaced the row that carried the application's mark and name**, which spent the one
	 * permanent row at the top of the shell on a logo. The mark survives as this control's glyph,
	 * so the shell still says which application it is; the product's name does not, because a
	 * desktop window carries it in its title bar and its taskbar already.
	 *
	 * **The menu is the workspace and what can be done to it.** The human chose the shape from
	 * ClickUp's on 2026-08-20: the workspace at the top with its members under its name, its two
	 * actions side by side under that, and the way to make another at the foot.
	 *
	 * **There is no list of workspaces to choose from, and that is not a section left out.** An
	 * account owns exactly one workspace ([[efforts/a-workspace-follows-its-user]], requirement 6),
	 * so there is nothing that is not already open, and a list showing the one you are looking at
	 * is a switcher that cannot switch. The section arrives when a second workspace does, which is
	 * requirement 14's organization work. Until then that effort's acceptance criterion 2 holds by
	 * construction rather than by care: nothing here selects anything.
	 *
	 * *An earlier build did draw the one-row list, with a check on it. It was removed on sight.*
	 */
	let { workspace, memberCount }: { workspace: RemoteSyncWorkspace; memberCount: number } =
		$props();

	const sidebar = useSidebar();

	/**
	 * which side the menu opens on.
	 *
	 * The content primitive already sets `dir`, from the design contract since #779, but `side` is
	 * physical in bits-ui: it names an edge of the screen rather than an edge of the reading order.
	 * So it is computed here, from this application's locale, or the menu opens over the rail it
	 * belongs to in Arabic.
	 */
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
						<div
							class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
						>
							<InnerShadowTopIcon class="size-4" />
						</div>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-medium">{workspace.name}</span>
							<!-- the second line tells this row from the account row under it, which carries
							     the same name on an account whose workspace is named after them. It says
							     something true about the workspace rather than repeating what it is
							     called. -->
							<span class="truncate text-xs text-muted-foreground">
								{$LL.layout.workspaceMenu.members({ count: memberCount })}
							</span>
						</div>
						<ChevronsUpDownIcon class="ms-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-64"
				align="start"
				{side}
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal">
					<div class="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
						<div
							class="flex aspect-square size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"
						>
							<InnerShadowTopIcon class="size-5" />
						</div>
						<div class="grid min-w-0 flex-1 leading-tight">
							<span class="truncate font-medium">{workspace.name}</span>
							<span class="truncate text-xs text-muted-foreground">
								{$LL.layout.workspaceMenu.members({ count: memberCount })}
							</span>
						</div>
					</div>
				</DropdownMenu.Label>

				<!-- the workspace's two actions, side by side. **Menu items rather than buttons**, for
				     a reason that is invisible until somebody uses a keyboard: this menu holds focus
				     and closes on tab, so a plain button laid inside it looks reachable and is not.
				     Items keep the arrow-key order, which does not care that they are drawn in a row. -->
				<div class="flex gap-1 px-1 pt-1 pb-2">
					<DropdownMenu.Item class="flex-1 justify-center border">
						{#snippet child({ props })}
							<a href={resolve('/workspace')} {...props}>
								<SettingsIcon class="size-4 shrink-0" />
								<span class="capitalize">{$LL.layout.workspaceMenu.settings()}</span>
							</a>
						{/snippet}
					</DropdownMenu.Item>

					<!-- inviting is the workspace's other action, so it sits beside its settings. It is
					     inert for the same reason the new-workspace row is, and it keeps its place in
					     the keyboard order: `disabled` would take it out, which is exactly where a
					     control that has to explain itself must stay. -->
					<DropdownMenu.Item
						class="flex-1 justify-center border text-muted-foreground"
						aria-disabled="true"
						closeOnSelect={false}
						onSelect={(event) => event.preventDefault()}
					>
						<UserPlusIcon class="size-4 shrink-0" />
						<span class="capitalize">{$LL.layout.workspaceMenu.invite()}</span>
						<LockIcon class="size-3 shrink-0" />
					</DropdownMenu.Item>
				</div>

				<DropdownMenu.Separator />

				<!-- at the foot, where the reference puts it, and inert for now. -->
				<DropdownMenu.Item
					class="gap-2"
					aria-disabled="true"
					closeOnSelect={false}
					onSelect={(event) => event.preventDefault()}
				>
					<PlusIcon class="size-4 shrink-0" />
					<div class="grid min-w-0 flex-1 leading-tight">
						<span class="truncate font-medium text-muted-foreground">
							{$LL.layout.workspaceMenu.create()}
						</span>
						<span class="truncate text-xs text-muted-foreground">
							{$LL.layout.workspaceMenu.locked()}
						</span>
					</div>
					<LockIcon class="ms-auto size-3.5 shrink-0" />
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
