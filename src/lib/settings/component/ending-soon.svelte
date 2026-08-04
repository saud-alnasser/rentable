<script lang="ts">
	import api from '$lib/api/caller';
	import { Button } from '$lib/design/primitive/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/design/primitive/card';
	import { Input } from '$lib/design/primitive/input';
	import { Label } from '$lib/design/primitive/label';
	import { cn } from '$lib/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useSetEndingSoonNoticeDays } from '$lib/settings/query';
	import { toast } from 'svelte-sonner';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	let { settings }: { settings: AppSettings } = $props();

	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();
	const settingsInsetPanelClass = 'rounded-2xl border bg-muted p-4 text-start';
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

<Card>
	<CardHeader class="gap-3 border-b pb-5">
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
