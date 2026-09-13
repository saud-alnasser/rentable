<script lang="ts">
	import type { OrganizationWorkspace, RemoteSyncWorkspace } from '$lib/platform/host';
	import { resolve } from '$app/paths';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { useSidebar } from '@rentable/design/primitive/sidebar/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { openOrganizationDialog } from '$lib/organization/dialogs.svelte';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import SettingsIcon from '@tabler/icons-svelte/icons/settings';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
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
	 * **The workspaces the member holds are listed between the actions and the foot, and the open
	 * one is marked.** An organization holds several and a member holds a grant on some of them
	 * ([[efforts/824-the-way-in-and-the-workspace-control-are-redesigned/spec]], requirement 9),
	 * so the list is `workspaces` as the session reads it, and choosing another row opens that
	 * workspace by the path a sign-in takes past the wall. A member holding one sees the one row,
	 * marked: the list says where they are even when there is nowhere else to go.
	 *
	 * **The open row is named by `openId` and the header by `workspace`, and both come off the one
	 * remote-sync query** the rail reads, so the marker and the name cannot disagree. The menu
	 * draws and never decides: it is handed the rows and a callback, and reads no query itself.
	 *
	 * **The two actions are live for whoever their permission admits, and say whose act it is for
	 * everybody else.** Inviting is an administrator's or the owner's; a new workspace is the owner's,
	 * from the machine that holds the Turso authority. Each row opens its form, the one mounted in
	 * the shell (`organization/dialogs.svelte.ts`), or is drawn refused with a sentence, never a
	 * padlock: nothing here is locked, and a padlock said it was. **Who may do what is the session's**
	 * ([[rules/credentials]]), and Rust refuses again regardless; the sidebar composes the sentences
	 * from the locale, and this menu draws them.
	 *
	 * *This said an account owns exactly one workspace, from before organizations, and that a
	 * list showing the one you are looking at is a switcher that cannot switch. It can now. Its two
	 * actions were inert rows with a padlock until effort 824; the organization page did both.*
	 */
	let {
		workspace,
		workspaces,
		openId,
		memberCount,
		canInvite,
		canCreateWorkspace,
		refusal,
		onSwitch
	}: {
		/** the workspace this machine has open, as the sync record names it: the header. */
		workspace: RemoteSyncWorkspace;
		/** every workspace the signed-in member holds a grant on, as the session lists them. */
		workspaces: OrganizationWorkspace[];
		/** which of `workspaces` is open, marked in the list; `null` where none is named yet. */
		openId: string | null;
		memberCount: number;
		/** whether the session permits inviting; the row opens the invite dialog when it does. */
		canInvite: boolean;
		/** whether the session is the owner's, holding the Turso authority; the row opens the workspace dialog when it is. */
		canCreateWorkspace: boolean;
		/** the sentence each refused row carries, saying whose act it is; `null` where the row is live. */
		refusal: { invite: string | null; workspace: string | null };
		/** a row other than the open one was chosen: open that workspace. */
		onSwitch: (id: string) => void;
	} = $props();

	const inviteRefusalId = 'workspace-menu-invite-refusal';

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
				<div class="px-1 pt-1 pb-2">
					<div class="flex gap-1">
						<DropdownMenu.Item class="flex-1 justify-center border">
							{#snippet child({ props })}
								<a href={resolve('/workspace')} {...props}>
									<SettingsIcon class="size-4 shrink-0" />
									<span class="capitalize">{$LL.layout.workspaceMenu.settings()}</span>
								</a>
							{/snippet}
						</DropdownMenu.Item>

						<!-- inviting is the workspace's other action, so it sits beside its settings. Live
						     for whoever the session admits; otherwise refused, and it keeps its place in
						     the keyboard order: `disabled` would take it out, which is exactly where a
						     control that has to explain itself must stay. The sentence sits under the
						     pair, where a row this narrow has no room for it, and the row names it.
						     **The refused row is drawn through `child`**, because the primitive writes
						     `aria-disabled` from its own `disabled` and would overwrite the attribute
						     set on it; the element here spreads the primitive's props and then says so. -->
						{#if canInvite}
							<DropdownMenu.Item
								class="flex-1 justify-center border"
								data-workspace-menu-invite
								onSelect={() => openOrganizationDialog('invite')}
							>
								<UserPlusIcon class="size-4 shrink-0" />
								<span class="capitalize">{$LL.layout.workspaceMenu.invite()}</span>
							</DropdownMenu.Item>
						{:else}
							<DropdownMenu.Item
								class="flex-1 justify-center border text-muted-foreground"
								closeOnSelect={false}
								onSelect={(event) => event.preventDefault()}
							>
								{#snippet child({ props })}
									<div
										{...props}
										aria-disabled="true"
										aria-describedby={inviteRefusalId}
										data-workspace-menu-invite
									>
										<UserPlusIcon class="size-4 shrink-0" />
										<span class="capitalize">{$LL.layout.workspaceMenu.invite()}</span>
									</div>
								{/snippet}
							</DropdownMenu.Item>
						{/if}
					</div>

					{#if !canInvite && refusal.invite}
						<p
							id={inviteRefusalId}
							class="px-1 pt-1.5 text-xs leading-tight text-muted-foreground"
							data-workspace-menu-invite-refusal
						>
							{refusal.invite}
						</p>
					{/if}
				</div>

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
								<span class="truncate">{held.name}</span>
								{#if checked}
									<span class="sr-only">{$LL.layout.workspaceMenu.open()}</span>
								{/if}
							{/snippet}
						</DropdownMenu.RadioItem>
					{/each}
				</DropdownMenu.RadioGroup>

				<DropdownMenu.Separator />

				<!-- at the foot, where the reference puts it. Live for the owner holding the authority;
				     for everybody else the second line says whose act it is, or what the owner has to
				     do first. -->
				{#if canCreateWorkspace}
					<DropdownMenu.Item
						class="gap-2"
						data-workspace-menu-create
						onSelect={() => openOrganizationDialog('workspace')}
					>
						<PlusIcon class="size-4 shrink-0" />
						<span class="truncate font-medium">{$LL.layout.workspaceMenu.create()}</span>
					</DropdownMenu.Item>
				{:else}
					<!-- through `child`, for the reason the invite row gives. -->
					<DropdownMenu.Item
						class="gap-2"
						closeOnSelect={false}
						onSelect={(event) => event.preventDefault()}
					>
						{#snippet child({ props })}
							<div {...props} aria-disabled="true" data-workspace-menu-create>
								<PlusIcon class="size-4 shrink-0" />
								<div class="grid min-w-0 flex-1 leading-tight">
									<span class="truncate font-medium text-muted-foreground">
										{$LL.layout.workspaceMenu.create()}
									</span>
									<span
										class="text-xs whitespace-normal text-muted-foreground"
										data-workspace-menu-create-refusal
									>
										{refusal.workspace}
									</span>
								</div>
							</div>
						{/snippet}
					</DropdownMenu.Item>
				{/if}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
