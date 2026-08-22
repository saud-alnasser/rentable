<script lang="ts">
	import type { RemoteSyncWorkspace } from '$lib/platform/host';
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';
	import Permitted from '$lib/workspace/component/permitted.svelte';
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
	 *
	 * **The rename is offered only to a member the workspace permits to take it**, and it is
	 * *absent* for one it does not rather than present and unavailable. The rule for choosing is
	 * what absence would cost a reader (requirement 4), and here it costs nothing: what is left is
	 * an icon, the workspace's name, and a line about the picture — a row that says what this
	 * workspace is called, which reads as complete because that is all it ever claimed to be.
	 * Nothing on it describes an act that is not there. *The unavailable branch is for a row that
	 * would be left announcing something missing, which this is not — and an inert control here
	 * would put back exactly what #706 removed from this slot.*
	 *
	 * **Drawing it is a courtesy and the procedure behind it is what makes hiding it honest.**
	 * `remoteSync.rename` refuses the same member whether or not this drew the button, and the
	 * control plane refuses it again after that.
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
	     because there was nothing it could do. What it does now is open the form — for the member
	     the workspace permits to rename it, and for nobody else. -->
	<Permitted acts={['renameWorkspace']} otherwise="absent">
		<Button variant="outline" size="sm" class="shrink-0" onclick={() => (isRenaming = true)}>
			<PencilIcon class="size-3.5 shrink-0" />
			{$LL.workspace.rename()}
		</Button>
	</Permitted>
</Field.Field>

<!-- the form stays outside the gate, and nothing is lost by that: `isRenaming` is set by the
     button above and by nothing else, so a member the gate refused has no way to reach it. A
     second gate around a dialog that cannot be opened would be a second subscription and a second
     copy of the act's name, for a surface nobody can see. -->
<WorkspaceRenameForm {workspace} open={isRenaming} onOpenChange={(value) => (isRenaming = value)} />
