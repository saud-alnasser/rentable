<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { LL } from '$lib/i18n/i18n-svelte';

	let {
		message,
		onRetry
	}: {
		message: string | null;
		onRetry: () => void;
	} = $props();
</script>

<div class="flex min-h-full flex-1 items-center justify-center p-1">
	<Card class="w-full max-w-lg gap-4">
		<CardHeader>
			<CardTitle>{$LL.layout.startup.failedToStartTitle()}</CardTitle>
			<CardDescription>{$LL.layout.startup.failedToStartDescription()}</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<p class="text-sm text-muted-foreground">{message}</p>
			<Button onclick={onRetry}>{$LL.common.actions.retryStartup()}</Button>
		</CardContent>
	</Card>
</div>
