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

	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsSubtlePanelClass =
		'rounded-xl border border-primary/10 bg-accent/35 p-3 text-start backdrop-blur-sm';
</script>

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
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
