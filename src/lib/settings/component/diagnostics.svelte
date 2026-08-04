<script lang="ts">
	import { Button } from '$lib/design/primitive/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/design/primitive/card';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		diagnosticsDir,
		onRevealDiagnostics
	}: {
		diagnosticsDir: string;
		onRevealDiagnostics: () => void;
	} = $props();

	const settingsSubtlePanelClass = 'rounded-xl border bg-muted p-3 text-start';
</script>

<Card>
	<CardHeader class="gap-3 border-b pb-5">
		<CardTitle>{$LL.settings.diagnosticsTitle()}</CardTitle>
		<CardDescription>{$LL.settings.diagnosticsDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4 pt-5">
		<div class={settingsSubtlePanelClass}>
			<p class="text-xs tracking-wide text-muted-foreground uppercase">
				{$LL.settings.diagnosticsLocationLabel()}
			</p>
			<!-- the path is the machine's, not the reader's language: isolating it
			     keeps an ltr path from reordering the arabic around it -->
			<p class="mt-1 text-sm break-all" dir="ltr">{diagnosticsDir}</p>
		</div>

		<Button variant="outline" onclick={onRevealDiagnostics} disabled={!diagnosticsDir}>
			{$LL.settings.diagnosticsReveal()}
		</Button>
	</CardContent>
</Card>
