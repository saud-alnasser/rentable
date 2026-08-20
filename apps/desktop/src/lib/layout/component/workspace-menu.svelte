<script lang="ts">
	import type { RemoteSyncWorkspace } from '$lib/platform/host';
	import * as DropdownMenu from '$lib/design/primitive/dropdown-menu';
	import * as Sidebar from '$lib/design/primitive/sidebar';
	import { useSidebar } from '$lib/design/primitive/sidebar';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/**
	 * The workspace this machine has open, at the top of the rail.
	 *
	 * **It replaced the row that carried the application's mark and name**, which spent the one
	 * permanent row at the top of the shell on a logo. The mark survives as this control's glyph,
	 * so the shell still says which application it is; the product's name does not, because a
	 * desktop window carries it in its title bar and its taskbar already.
	 *
	 * **Nothing here switches anything, and that is not a gap.** An account owns exactly one
	 * workspace ([[efforts/a-workspace-follows-its-user]], requirement 6), so the list is one row
	 * and marking it is the whole of what it does. Selecting it closes the menu. That effort's
	 * acceptance criterion 2 forbids a *mechanism* for opening a second workspace, and was
	 * rewritten on 2026-08-20 to say so in those words: naming what is open is not one.
	 */
	let { workspace }: { workspace: RemoteSyncWorkspace } = $props();

	const sidebar = useSidebar();

	/**
	 * which side the menu opens on.
	 *
	 * The content primitive already sets `dir` from the locale, but `side` is physical in bits-ui:
	 * it names an edge of the screen rather than an edge of the reading order. So it is computed,
	 * or the menu opens over the rail it belongs to in Arabic.
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
							<!-- the second line exists to tell this row from the account row under it,
							     which carries the same name today: a workspace is named for the person
							     who owns it. It says what the row *is* rather than repeating what it is
							     called. -->
							<span class="truncate text-xs text-muted-foreground">
								{$LL.layout.workspaceMenu.label()}
							</span>
						</div>
						<ChevronsUpDownIcon class="ms-auto size-4" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>

			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
				align="start"
				{side}
				sideOffset={4}
			>
				<DropdownMenu.Label class="text-xs text-muted-foreground">
					{$LL.layout.workspaceMenu.heading()}
				</DropdownMenu.Label>

				<DropdownMenu.Item class="gap-2 p-2">
					<div class="flex size-6 shrink-0 items-center justify-center rounded-md border">
						<InnerShadowTopIcon class="size-3.5 shrink-0" />
					</div>
					<span class="truncate">{workspace.name}</span>
					<CheckIcon class="ms-auto size-4 shrink-0" />
				</DropdownMenu.Item>

				<DropdownMenu.Separator />

				<!-- **Reachable, announced, and inert.** `disabled` would have been shorter and is
				     wrong: it sets `data-disabled`, which this item's own classes turn into
				     `pointer-events-none`, and it drops the row out of the keyboard order — so the
				     one control that has to explain itself becomes the one nobody can reach. It is
				     `aria-disabled` instead, it keeps its place, and it says why in text rather
				     than in a tooltip. -->
				<DropdownMenu.Item
					class="gap-2 p-2"
					aria-disabled="true"
					closeOnSelect={false}
					onSelect={(event) => event.preventDefault()}
				>
					<div
						class="flex size-6 shrink-0 items-center justify-center rounded-md border bg-transparent"
					>
						<PlusIcon class="size-4 shrink-0" />
					</div>
					<div class="grid min-w-0 flex-1 leading-tight">
						<span class="truncate font-medium text-muted-foreground">
							{$LL.layout.workspaceMenu.create()}
						</span>
						<span class="truncate text-xs text-muted-foreground">
							{$LL.layout.workspaceMenu.createLocked()}
						</span>
					</div>
					<LockIcon class="ms-auto size-3.5 shrink-0" />
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
