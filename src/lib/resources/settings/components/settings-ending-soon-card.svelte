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
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useSetEndingSoonNoticeDays } from '$lib/resources/settings/hooks/queries';
	import { toast } from 'svelte-sonner';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	let { settings }: { settings: AppSettings } = $props();

	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();
	const settingsCardClass = 'border-border/70 bg-card/65 shadow-xl backdrop-blur-xl';
	const settingsInsetPanelClass =
		'rounded-[1.25rem] border border-border/70 bg-background/60 p-4 text-start shadow-sm backdrop-blur-md';
	const formatNoticeWindow = (days: number) =>
		days === 1 ? $LL.common.time.day({ count: days }) : $LL.common.time.days({ count: days });

	let value = $state<number | ''>('');

	const isPending = $derived(setEndingSoonNoticeDaysMutation.isPending);
	const enteredValue = $derived(typeof value === 'number' ? String(value) : value.trim());
	const hasChange = $derived(enteredValue !== String(settings.endingSoonNoticeDays));

	$effect(() => {
		const savedValue = settings.endingSoonNoticeDays;

		if (setEndingSoonNoticeDaysMutation.isPending) {
			return;
		}

		value = savedValue;
	});

	async function save() {
		const days = Number(value);

		if (!Number.isInteger(days) || days <= 0) {
			toast.error($LL.settings.endingSoonInvalid());
			return;
		}

		try {
			await setEndingSoonNoticeDaysMutation.mutateAsync({ days });
		} catch {
			/* ignore */
		}
	}
</script>

<Card class={settingsCardClass}>
	<CardHeader class="gap-3 border-b border-border/50 pb-5">
		<CardTitle>{$LL.settings.endingSoonTitle()}</CardTitle>
		<CardDescription>{$LL.settings.endingSoonDescription()}</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4 pt-5">
		<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
			<div class={settingsInsetPanelClass}>
				<p class="text-xs tracking-wide text-muted-foreground uppercase">
					{$LL.common.labels.currentValue()}
				</p>
				<p class="mt-1 text-base font-semibold">
					{formatNoticeWindow(settings.endingSoonNoticeDays)}
				</p>
			</div>

			<div class={cn(settingsInsetPanelClass, 'space-y-2')}>
				<Label for="ending-soon-notice-days">{$LL.common.labels.noticeWindowDays()}</Label>
				<Input id="ending-soon-notice-days" type="number" min="1" step="1" bind:value />
			</div>
		</div>

		<div class="flex justify-end">
			<Button onclick={() => void save()} disabled={isPending || !hasChange}>
				{isPending ? $LL.common.actions.saving() : $LL.common.actions.saveWindow()}
			</Button>
		</div>
	</CardContent>
</Card>
