<script lang="ts">
	import type { RemoteSyncWorkspace } from '$lib/platform/host';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';
	import WorkspaceRenameForm from '$lib/workspace/component/rename-form.svelte';
	import InnerShadowTopIcon from '@tabler/icons-svelte/icons/inner-shadow-top';
	import PencilIcon from '@lucide/svelte/icons/pencil';

	/**
	 * What the workspace is called, and the picture it does not have yet.
	 *
	 * **The icon is a placeholder rather than an unset value, and the difference matters.** The
	 * workspace record in the control plane has no icon column at all, so there is nothing to read
	 * and nothing that failed to load. Drawing the slot now is deliberate: the page is shaped
	 * around it before there is a mechanism, the same way the create-workspace row is, so that
	 * arriving at one does not mean redesigning the page around it.
	 *
	 * **The name can be changed and the icon still cannot**, which is why the row says one of those
	 * and offers the other. *It said neither could be, and offered an inert control that explained
	 * why; requirement 4d of
	 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]` replaced that control with
	 * the rename and left the sentence about the picture where a reader was already reading it.*
	 *
	 * **The name it draws is the control plane's**, not this machine's, so it is the same name on
	 * every machine signed in to this workspace and it changes on all of them.
	 */
	let { workspace }: { workspace: RemoteSyncWorkspace } = $props();

	let isRenaming = $state(false);
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

	<!-- a real control at last: this slot held a button that was reachable, announced and inert,
	     because there was nothing it could do. What it does now is open the form. -->
	<Button variant="outline" size="sm" class="shrink-0" onclick={() => (isRenaming = true)}>
		<PencilIcon class="size-3.5 shrink-0" />
		{$LL.workspace.rename()}
	</Button>
</Field.Field>

<WorkspaceRenameForm {workspace} open={isRenaming} onOpenChange={(value) => (isRenaming = value)} />
