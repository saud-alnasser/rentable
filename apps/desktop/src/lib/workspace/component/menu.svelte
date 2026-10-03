<script lang="ts">
	import type { RemoteSyncWorkspace } from '$lib/sync';
	import type { OrganizationWorkspace } from '$lib/organization';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/platform/locale';
	import { withSection } from '$lib/settings';
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
	 * **The trigger names where you are, and nothing else** (requirement 10 of
	 * [[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/spec]]): the mark's tile
	 * and the open workspace's name on one line, with the up-down chevron that says it opens a
	 * choice. It counted members on a second line until effort 843, which was what the menu said
	 * again under its own header; a switcher names the place and leaves the rest to the menu, as
	 * Xcode's scheme menu and Safari's profiles do.
	 *
	 * **The menu is the switch, then one command** (requirement 11): the workspaces the member
	 * holds, the open one checked, a separator, and "workspace settings", which leads to the
	 * workspaces section of the settings area. It carries no ellipsis: it goes to a place rather than
	 * asking for more before it acts (Apple's HIG, *Menus*). It read "manage workspaces…" until
	 * ticket 55 of [[efforts/846-the-settings-and-the-record-cards-are-rethought/spec]], when the
	 * human asked for better words on 2026-10-03. There is no header and no heading: the header repeated the trigger, and a
	 * "switch to" heading over a list of one promised a switch the list could not make. Nothing here
	 * invites anybody and nothing here makes a workspace, so the menu carries no permission and
	 * refuses nobody.
	 *
	 * **The workspaces the member holds are the rows, and the open one is checked.** An organization
	 * holds several and a member holds a grant on some of them
	 * ([[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], requirement 9),
	 * so the list is `workspaces` as the session reads it, and choosing another row opens that
	 * workspace by the path a sign-in takes past the wall. A member holding one sees the one row,
	 * checked: the list says where they are even when there is nowhere else to go.
	 *
	 * **The checked row is named by `openId` and the trigger by `workspace`, and both come off the
	 * one remote-sync query** the rail reads, so the check and the name cannot disagree. The menu
	 * draws and never decides: it is handed the rows and a callback, and reads no query itself.
	 *
	 * **Past five workspaces the list scrolls, and the command under it does not** (ticket 55 of
	 * effort 846, at the human's word of 2026-10-03). The radio group is its own scroll container,
	 * capped at five and a half rows: the half-shown sixth row is the cue that more is below, as a
	 * macOS menu gives it, and the separator and "workspace settings" stay in view beneath it. Five
	 * or fewer draw no cap at all, so a short list keeps exactly its own height. Opening scrolls the
	 * open workspace into view, and the arrow keys keep the row they reach in view: the menu
	 * primitive focuses a row with `preventScroll`, so a row past the fold would be highlighted out
	 * of sight without this. Both scroll instantly, which is what reduced motion asks for anyway,
	 * and the scrollbar is the application's one quiet scrollbar from `tokens.css`.
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
		onSwitch
	}: {
		/** the workspace this machine has open, as the sync record names it: the trigger. */
		workspace: RemoteSyncWorkspace;
		/** every workspace the signed-in member holds a grant on, as the session lists them. */
		workspaces: OrganizationWorkspace[];
		/** which of `workspaces` is open, checked in the list; `null` where none is named yet. */
		openId: string | null;
		/** a row other than the open one was chosen: open that workspace. */
		onSwitch: (id: string) => void;
	} = $props();

	const sidebar = useSidebar();

	/**
	 * how many workspace rows show before the list scrolls. The list's cap is five and a half rows
	 * (`max-h-44`, 11rem, a row being 2rem), so a sixth row shows by half as the cue that the list
	 * goes on.
	 */
	const SHOWN_ROWS = 5;

	const scrolls = $derived(workspaces.length > SHOWN_ROWS);

	/** the radio group, which is the scroll container once `scrolls` holds. */
	let list = $state<HTMLElement | null>(null);

	/** bring a row into view inside the list, moving nothing further than it must. */
	const reveal = (row: Element | null | undefined) => {
		if (scrolls) {
			row?.scrollIntoView({ block: 'nearest' });
		}
	};

	// the list mounts when the menu opens: the open workspace is brought into view then, so a
	// member whose open workspace is the tenth sees it checked rather than only the first five.
	$effect(() => {
		reveal(list?.querySelector('[role="menuitemradio"][aria-checked="true"]'));
	});

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
						<span class="flex-1 truncate text-start font-medium"><bdi>{workspace.name}</bdi></span>
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
				<!-- the workspaces the member holds, one row each, with the open one checked. Radio
				     items rather than plain or checkbox ones, because that is what the rows are:
				     exactly one is open, and `menuitemradio` with `aria-checked` is what announces it
				     as current. The primitive draws the check and answers arrow keys for it. The row
				     already open selects nothing, since there is nothing to switch to.
				     Past five rows the group scrolls within itself (the comment above says why), and
				     a row the keyboard reaches is brought into view, since the primitive focuses it
				     without scrolling to it. -->
				<DropdownMenu.RadioGroup
					bind:ref={list}
					data-workspace-menu-list
					class={scrolls ? 'max-h-44 overflow-y-auto overscroll-contain' : undefined}
					onfocusin={(event: FocusEvent) =>
						reveal((event.target as Element | null)?.closest('[role="menuitemradio"]'))}
					value={openId ?? undefined}
					onValueChange={(id) => {
						if (id !== openId) {
							onSwitch(id);
						}
					}}
				>
					{#each workspaces as held (held.id)}
						<DropdownMenu.RadioItem value={held.id} indicator="check">
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

				<!-- "workspace settings": the workspaces section of the settings area, at the foot and
				     outside the list's scroll, since it is the one thing the menu offers besides the
				     switch. It read "workspaces" until effort 843, then "manage workspaces…" until
				     ticket 55 of effort 846; it goes to a place and asks nothing more before it does,
				     so it carries no ellipsis (Apple's HIG, *Menus*). It opened the
				     workspace page until 2026-09-14, which was one workspace; the section is the list
				     of the ones this member holds, which is what a menu about workspaces should reach.
				     **A menu item rather than a plain link**, for a reason that is invisible until
				     somebody uses a keyboard: this menu holds focus and closes on tab, so an anchor
				     laid inside it looks reachable and is not. -->
				<DropdownMenu.Item class="gap-2">
					{#snippet child({ props })}
						<a href={resolve(withSection('workspaces'))} data-workspace-menu-manage {...props}>
							<BuildingIcon class="size-4 shrink-0" />
							<span class="truncate capitalize">{$LL.layout.workspaceMenu.manage()}</span>
						</a>
					{/snippet}
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
