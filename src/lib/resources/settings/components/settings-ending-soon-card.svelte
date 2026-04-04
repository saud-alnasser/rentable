<script lang="ts">
	import api from '$lib/api/mod';
	import { Button } from '$lib/common/components/fragments/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import { LL } from '$lib/i18n/i18n-svelte';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	let {
		settings,
		value = $bindable(),
		isPending,
		hasChange,
		onSave
	}: {
		settings: AppSettings;
		value: number | '';
		isPending: boolean;
		hasChange: boolean;
		onSave: () => void;
	} = $props();

	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 text-start shadow-sm backdrop-blur-md';
	const formatNoticeWindow = (days: number) =>
		days === 1 ? $LL.common.time.day({ count: days }) : $LL.common.time.days({ count: days });
</script>

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle>{$LL.settings.endingSoonTitle()}</CardTitle>
		<CardDescription>{$LL.settings.endingSoonDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4 pt-5">
		<div class={`${settingsInsetPanelClass} space-y-2`}>
			<Label for="ending-soon-notice-days">{$LL.common.labels.noticeWindowDays()}</Label>
			<Input id="ending-soon-notice-days" type="number" min="1" step="1" bind:value />
		</div>

		<div class="flex flex-wrap items-center gap-3">
			<Button onclick={onSave} disabled={isPending || !hasChange}>
				{isPending ? $LL.common.actions.saving() : $LL.common.actions.saveWindow()}
			</Button>
			<p class="text-sm text-muted-foreground">
				{$LL.common.labels.currentValue()}: {formatNoticeWindow(settings.endingSoonNoticeDays)}
			</p>
		</div>
	</CardContent>
</Card>
