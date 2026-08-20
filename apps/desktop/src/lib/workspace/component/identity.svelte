<script lang="ts">
	import type { RemoteSyncWorkspace } from '$lib/platform/host';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import LockIcon from '@lucide/svelte/icons/lock';

	/**
	 * What the workspace is called, and the picture it does not have yet.
	 *
	 * **The icon is a placeholder rather than an unset value, and the difference matters.** The
	 * workspace record in the control plane has no icon column at all, so there is nothing to read
	 * and nothing that failed to load. Drawing the slot now is deliberate: the page is shaped
	 * around it before there is a mechanism, the same way the create-workspace row is, so that
	 * arriving at one does not mean redesigning the page around it.
	 *
	 * **Neither the name nor the icon can be changed here.** A workspace's name is set once at
	 * sign-up from the person's Google profile and there is no rename surface anywhere; adding one
	 * is its own decision.
	 */
	let { workspace }: { workspace: RemoteSyncWorkspace } = $props();
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<div class="flex min-w-0 items-center gap-3">
			<div
				class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"
			>
				<InnerShadowTopIcon class="size-6" />
			</div>
			<div class="grid min-w-0 gap-1">
				<p class="truncate text-sm font-medium">{workspace.name}</p>
				<p class="truncate text-sm text-muted-foreground">{$LL.workspace.identityDescription()}</p>
			</div>
		</div>
	</Field.Content>

	<!-- reachable, announced, and inert, the same shape the create-workspace row takes. **A button
	     rather than a decorated `div`**: a control nobody can focus cannot explain itself, and a
	     non-interactive element carrying `tabindex` and `aria-disabled` is two accessibility
	     warnings saying the same thing. `disabled` is the one attribute it must not have, because
	     that is what would take it out of the keyboard order. -->
	<Button
		variant="outline"
		size="sm"
		class="shrink-0"
		aria-disabled="true"
		onclick={(event) => event.preventDefault()}
	>
		<LockIcon class="size-3.5 shrink-0" />
		{$LL.workspace.iconLocked()}
	</Button>
</Field.Field>
