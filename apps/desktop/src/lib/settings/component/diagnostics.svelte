<script lang="ts">
	import SurfaceAction from '@rentable/design/block/surface-action.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';

	/**
	 * Where this installation writes down what went wrong.
	 *
	 * **The control is a glyph, and it is the same glyph the two startup-failure screens offer.**
	 * `[[efforts/settings-and-the-workspace-finish-what-they-offer]]`, requirement 3. A person
	 * reaching this row is usually on their way to a support message with a startup failure behind
	 * them, and `startup-error.svelte` and `startup-unreadable.svelte` both put this same action
	 * behind `FolderOpenIcon` with this same string as its name. A text button here was the third
	 * appearance of one action in a second form.
	 *
	 * **It is the same decision as the updates row above**, reached from the other side: one row on
	 * this page carrying a glyph while its neighbour carries a paragraph-width button is the
	 * odd-one-out that both requirements exist to remove.
	 *
	 * The label survives as the control's accessible name and as its tooltip, so nothing that was
	 * readable is now only hoverable for a screen reader.
	 */
	let {
		diagnosticsDir,
		onRevealDiagnostics
	}: {
		diagnosticsDir: string;
		onRevealDiagnostics: () => void;
	} = $props();
</script>

<Field.Field orientation="responsive">
	<Field.Content>
		<!-- no title of its own: the group above is already called diagnostics, and this row was
		     repeating it word for word. -->
		<Field.Description>{$LL.settings.diagnosticsDescription()}</Field.Description>
		<!-- the path is the machine's, not the reader's language: isolating it keeps an ltr
		     path from reordering the arabic around it -->
		<p class="text-xs break-all text-muted-foreground" dir="ltr">{diagnosticsDir}</p>
	</Field.Content>

	<div class="shrink-0">
		<SurfaceAction
			label={$LL.settings.diagnosticsReveal()}
			icon={FolderOpenIcon}
			disabled={!diagnosticsDir}
			onclick={onRevealDiagnostics}
		/>
	</div>
</Field.Field>
