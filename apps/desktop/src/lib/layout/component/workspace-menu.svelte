<script lang="ts">
	import type { OrganizationWorkspace, RemoteSyncWorkspace } from '$lib/platform/host';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { withSection } from '$lib/settings/section';
	import MarkIcon from '@lucide/svelte/icons/eclipse';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';

	/**
	 * The workspace this machine has open, at the top of the rail.
	 *
	 * **It replaced the row that carried the application's mark and name**, which spent the one
	 * permanent row at the top of the shell on a logo. The mark survives as this control's glyph,
	 * so the shell still says which application it is; the product's name does not, because a
	 * desktop window carries it in its title bar and its taskbar already.
	 *
	 * **The menu is the workspace and the switch** (requirement 9 of
	 * [[efforts/828-the-link-needs-a-code-and-the-settings-area-guides/spec]]): its header names the
	 * workspace that is open, the rows under it are the workspaces the member holds with the open
	 * one marked, and one row at the foot leads to the workspaces section of the settings area.
	 * Nothing here invites anybody and nothing here makes a workspace, so the menu carries no
	 * permission and refuses nobody: a reader who came to switch is offered the switch, and a reader
	 * who came to do something to a workspace is handed the section where every act on one lives.
	 *
	 * **The workspaces the member holds are listed under the header, and the open one is marked.**
	 * An organization holds several and a member holds a grant on some of them
	 * ([[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], requirement 9),
	 * so the list is `workspaces` as the session reads it, and choosing another row opens that
	 * workspace by the path a sign-in takes past the wall. A member holding one sees the one row,
	 * marked: the list says where they are even when there is nowhere else to go.
	 *
	 * **The open row is named by `openId` and the header by `workspace`, and both come off the one
	 * remote-sync query** the rail reads, so the marker and the name cannot disagree. The menu
	 * draws and never decides: it is handed the rows and a callback, and reads no query itself.
	 *
	 * *Until 2026-09-15 the menu also carried two acts that are not the workspace's. It took its
	 * shape from ClickUp's on 2026-08-20, which the human chose then: the workspace at the top, its
	 * two actions side by side under it, and the way to make another at the foot. Effort 826's
	 * requirement 17 held that shape, so inviting and a new workspace sat inside the switcher, each
	 * drawn refused with a sentence for the readers their permission does not admit, which was most
	 * of them. Both were in the settings area already, in the sections they belong to, and that is
	 * where they are now.*
	 *
	 * *This said an account owns exactly one workspace, from before organizations, and that a list
	 * showing the one you are looking at is a switcher that cannot switch. It can now.*
	 */
	let {
		workspace,
		workspaces,
		openId,
		memberCount,
		onSwitch
	}: {
		/** the workspace this machine has open, as the sync record names it: the header. */
		workspace: RemoteSyncWorkspace;
		/** every workspace the signed-in member holds a grant on, as the session lists them. */
		workspaces: OrganizationWorkspace[];
		/** which of `workspaces` is open, marked in the list; `null` where none is named yet. */
		openId: string | null;
		memberCount: number;
		/** a row other than the open one was chosen: open that workspace. */
		onSwitch: (id: string) => void;
	} = $props();

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

<Sidebar.Menu data-workspace-menu>
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
							<MarkIcon class="size-4" />
						</div>
						<div class="grid flex-1 text-start text-sm leading-tight">
							<span class="truncate font-medium"><bdi>{workspace.name}</bdi></span>
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
							<MarkIcon class="size-5" />
						</div>
						<div class="grid min-w-0 flex-1 leading-tight">
							<span class="truncate font-medium"><bdi>{workspace.name}</bdi></span>
							<span class="truncate text-xs text-muted-foreground">
								{$LL.layout.workspaceMenu.members({ count: memberCount })}
							</span>
						</div>
					</div>
				</DropdownMenu.Label>

				<DropdownMenu.Separator />

				<!-- the workspaces the member holds, one row each, with the open one marked. Radio
				     items rather than plain ones, because that is what the rows are: exactly one is
				     open, and the primitive draws the marker and answers arrow keys for it. The row
				     already open selects nothing, since there is nothing to switch to. -->
				<DropdownMenu.RadioGroup
					value={openId ?? undefined}
					onValueChange={(id) => {
						if (id !== openId) {
							onSwitch(id);
						}
					}}
				>
					<DropdownMenu.GroupHeading class="text-xs font-normal text-muted-foreground">
						{$LL.layout.workspaceMenu.switchTo()}
					</DropdownMenu.GroupHeading>
					{#each workspaces as held (held.id)}
						<DropdownMenu.RadioItem value={held.id}>
							{#snippet children({ checked })}
								<span class="truncate"><bdi>{held.name}</bdi></span>
								{#if checked}
									<span class="sr-only">{$LL.layout.workspaceMenu.open()}</span>
								{/if}
							{/snippet}
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>

				<DropdownMenu.Separator />

				<!-- the workspaces section of the settings area, at the foot and across the menu's
				     width, since it is the one thing the menu offers besides the switch. It opened the
				     workspace page until 2026-09-14, which was one workspace; the section is the list
				     of the ones this member holds, which is what a menu about workspaces should reach.
				     **A menu item rather than a plain link**, for a reason that is invisible until
				     somebody uses a keyboard: this menu holds focus and closes on tab, so an anchor
				     laid inside it looks reachable and is not. -->
				<DropdownMenu.Item class="gap-2">
					{#snippet child({ props })}
						<a href={resolve(withSection('workspaces'))} data-workspace-menu-workspaces {...props}>
							<BuildingIcon class="size-4 shrink-0" />
							<span class="truncate capitalize">{$LL.settings.section.workspaces()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
