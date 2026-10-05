<script lang="ts">
	import type { HeldOrganization } from '$lib/organization/host';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as DropdownMenu from '@rentable/design/primitive/dropdown-menu/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import DisconnectDialog from '$lib/organization/component/disconnect-dialog.svelte';
	import OrganizationTile from '$lib/organization/component/tile.svelte';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import XIcon from '@lucide/svelte/icons/x';

	/**
	 * The organizations this machine holds, at the head of the wall and the no-workspace screen
	 * (effort 851, requirements 2, 3 and 7).
	 *
	 * **The trigger names the chosen organization, and opens on a click** (the human's words of
	 * 2026-10-05: "it's the chosen org shown when hovered over it and clicked it becomes a dropdown
	 * of the orgs"). A row-sized outline button carrying the organization's tile, its name and the
	 * up-down chevron that says it opens a choice, as the workspace control at the top of the rail
	 * does (Apple's HIG, *Pop-up buttons*). The tile is a tinted square holding the name's first
	 * letter: `primitive/avatar` is for people, and an organization has no picture here.
	 *
	 * **The menu is the workspace menu's anatomy** (`workspace/component/menu.svelte`): the held
	 * organizations as radio rows with the chosen one checked, then a separator and "add
	 * organization" with a plus, last. Past five rows the list scrolls within itself and the add
	 * under it does not. Choosing the chosen row does nothing, since there is nowhere to switch to.
	 *
	 * **Every row carries an x at its trailing end that removes that organization** (requirement
	 * 5). The x never chooses its row: its press is stopped before the row hears it. It closes the
	 * menu and opens the disconnect confirm named for that row's organization, whose line says the
	 * Turso account is forgotten only where this machine holds that organization's consent, since
	 * it is false otherwise. A row reached by the keyboard answers Delete or Backspace the same way,
	 * so the remove does not need a pointer.
	 *
	 * **It draws and never decides.** The rows, the chosen id and three callbacks come in; what a
	 * choice, an add or a remove does is the screen's, which is what lets the wall and the
	 * no-workspace screen sign out first where they must. `disabled` is the screen being busy (a
	 * sign-in running on the wall, a workspace being created on the no-workspace screen;
	 * requirement 6): the trigger does not open.
	 */
	let {
		organizations,
		selected,
		disabled = false,
		onSelect,
		onAdd,
		onRemove
	}: {
		/** every organization this machine holds, in the order the record lists them. */
		organizations: HeldOrganization[];
		/** the id of the one the screen stands on, checked in the list and named on the trigger. */
		selected: string | null;
		/** whether the screen is busy, which leaves the switcher closed and unpressable. */
		disabled?: boolean;
		/** another organization was chosen. */
		onSelect: (organizationId: string) => void;
		/** "add organization" was chosen: the screen offers set up and join by a link. */
		onAdd: () => void;
		/** remove one, once its confirm is answered; a refusal it throws stays in the confirm. */
		onRemove: (organizationId: string) => Promise<void> | void;
	} = $props();

	/** how many rows show before the list scrolls, as the workspace menu caps its own. */
	const SHOWN_ROWS = 5;

	let open = $state(false);
	/** whether the remove confirm is up. */
	let isRemoveOpen = $state(false);
	/**
	 * the organization whose remove is asked about, kept after the confirm closes so its name
	 * does not empty while the dialog leaves.
	 */
	let removing = $state<HeldOrganization | null>(null);
	/** the radio group, which is the scroll container once `scrolls` holds. */
	let list = $state<HTMLElement | null>(null);

	const chosen = $derived(organizations.find((held) => held.id === selected) ?? null);
	const scrolls = $derived(organizations.length > SHOWN_ROWS);

	const reveal = (row: Element | null | undefined) => {
		if (scrolls) {
			row?.scrollIntoView({ block: 'nearest' });
		}
	};

	// the list mounts when the menu opens: the chosen organization is brought into view then.
	$effect(() => {
		reveal(list?.querySelector('[role="menuitemradio"][aria-checked="true"]'));
	});

	/** close the menu and ask about removing `held`. */
	const askToRemove = (held: HeldOrganization) => {
		open = false;
		removing = held;
		isRemoveOpen = true;
	};

	/** a press on the x is the x's alone: the row under it must not hear it and choose itself. */
	const stopped = (event: Event) => {
		event.stopPropagation();
	};
</script>

<DropdownMenu.Root bind:open>
	<DropdownMenu.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class="h-auto w-full justify-start gap-3 px-3 py-2 data-[state=open]:bg-accent"
				{disabled}
				data-organization-switcher
			>
				{#if chosen}
					<OrganizationTile name={chosen.name} size="card" />
					<span class="flex-1 truncate text-start" data-organization-switcher-name>
						<bdi>{chosen.name}</bdi>
					</span>
				{/if}
				<ChevronsUpDownIcon class="ms-auto size-4 text-muted-foreground" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>

	<DropdownMenu.Content
		class="w-(--bits-dropdown-menu-anchor-width) min-w-64"
		align="start"
		side="bottom"
		sideOffset={4}
		data-organization-switcher-menu
	>
		<!-- the held organizations, one row each, the chosen one checked: radio rows, because exactly
		     one is the wall's, and `menuitemradio` with `aria-checked` announces it as current. -->
		<DropdownMenu.RadioGroup
			bind:ref={list}
			data-organization-switcher-list
			class={scrolls ? 'max-h-44 overflow-y-auto overscroll-contain' : undefined}
			onfocusin={(event: FocusEvent) =>
				reveal((event.target as Element | null)?.closest('[role="menuitemradio"]'))}
			value={selected ?? undefined}
			onValueChange={(id) => {
				if (id !== selected) {
					onSelect(id);
				}
			}}
		>
			{#each organizations as held (held.id)}
				<DropdownMenu.RadioItem
					value={held.id}
					indicator="check"
					class="pe-1"
					data-organization-switcher-row={held.id}
					onkeydown={(event: KeyboardEvent) => {
						if (event.key === 'Delete' || event.key === 'Backspace') {
							event.preventDefault();
							askToRemove(held);
						}
					}}
				>
					{#snippet children({ checked })}
						<OrganizationTile name={held.name} size="row" />
						<span class="flex-1 truncate"><bdi>{held.name}</bdi></span>
						{#if checked}
							<span class="sr-only">{$LL.organization.switcher.chosen()}</span>
						{/if}
						<!-- the row's own remove. Its pointer and its click are stopped here, so the
						     row never hears them and is never chosen by them; the menu's focus stays
						     on the row, so the keyboard reaches the same act by Delete. -->
						<Button
							variant="ghost"
							size="icon-xs"
							tabindex={-1}
							class="ms-auto flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
							aria-label={$LL.organization.switcher.remove({ name: held.name })}
							data-organization-switcher-remove={held.id}
							onpointerdown={stopped}
							onpointerup={stopped}
							onclick={(event) => {
								event.stopPropagation();
								askToRemove(held);
							}}
						>
							<XIcon class="size-4" />
						</Button>
					{/snippet}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>

		<DropdownMenu.Separator />

		<DropdownMenu.Item class="gap-2" onSelect={onAdd} data-organization-switcher-add>
			<PlusIcon class="size-4 shrink-0" />
			<span class="truncate first-letter:uppercase">{$LL.organization.switcher.add()}</span>
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<!-- draws nothing until a row's x asks. Named for that row's organization, and its line says the
     Turso account goes only where this machine holds that organization's consent. -->
<DisconnectDialog
	open={isRemoveOpen}
	onOpenChange={(next) => (isRemoveOpen = next)}
	organizationName={removing?.name ?? ''}
	forgetsTurso={removing?.holdsTursoAuthority ?? false}
	onDisconnect={async () => {
		if (removing) await onRemove(removing.id);
	}}
/>
