<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import * as Field from '$lib/design/primitive/field';
	import { LL } from '$lib/i18n/i18n-svelte';

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
	<Button
		variant="outline"
		size="sm"
		onclick={onRevealDiagnostics}
		disabled={!diagnosticsDir}
		class="shrink-0"
	>
		{$LL.settings.diagnosticsReveal()}
	</Button>
</Field.Field>
