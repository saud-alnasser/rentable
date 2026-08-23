<script lang="ts">
	import api from '$lib/api/caller';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useSetEndingSoonNoticeDays } from '$lib/settings/query';
	import { toast } from 'svelte-sonner';

	type AppSettings = Awaited<ReturnType<typeof api.app.settings.get>>;

	let { settings }: { settings: AppSettings } = $props();

	const setEndingSoonNoticeDaysMutation = useSetEndingSoonNoticeDays();

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

<Field.Field orientation="responsive">
	<Field.Content>
		<Field.Label for="ending-soon-notice-days">{$LL.settings.endingSoonTitle()}</Field.Label>
		<Field.Description>{$LL.settings.endingSoonDescription()}</Field.Description>
	</Field.Content>
	<!-- the saved value is the field's own value: a second panel restating it was the page
	     saying the same number twice. -->
	<div class="flex items-center gap-2 sm:w-56">
		<Input id="ending-soon-notice-days" type="number" min="1" step="1" class="w-full" bind:value />
		<Button size="sm" onclick={() => void save()} disabled={isPending || !hasChange}>
			{isPending ? $LL.common.actions.saving() : $LL.common.actions.save()}
		</Button>
	</div>
</Field.Field>
