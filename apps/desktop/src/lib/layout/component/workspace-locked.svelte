<script lang="ts">
	import * as Sidebar from '@rentable/design/primitive/sidebar/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';

	/**
	 * The top of the rail when there is no workspace to name.
	 *
	 * **The same row as `workspace-menu.svelte`, holding its place rather than vanishing.** The
	 * mark, the two lines, the chevron: what is missing is the workspace's name, because nobody has
	 * signed in to have one. A row that disappears and comes back is the shell changing shape,
	 * which is the thing the signed-out rail exists not to do.
	 *
	 * It carries the chevron and refuses to open, which is deliberate rather than an oversight: the
	 * control is present and says it is present, and what it would open is the workspace's own
	 * actions, every one of which needs a workspace.
	 */
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<Sidebar.MenuButton size="lg" aria-disabled="true">
			<div
				class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
			>
				<InnerShadowTopIcon class="size-4" />
			</div>
			<div class="grid flex-1 text-start text-sm leading-tight">
				<span class="truncate font-medium">{$LL.common.nav.workspace()}</span>
				<span class="truncate text-xs text-muted-foreground">
					{$LL.layout.workspaceMenu.locked()}
				</span>
			</div>
			<ChevronsUpDownIcon class="ms-auto size-4" />
		</Sidebar.MenuButton>
	</Sidebar.MenuItem>
</Sidebar.Menu>
