<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Calendar from '@rentable/design/primitive/calendar/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { formatCalendarDate } from '$lib/date';
	import { getIntlLocale } from '$lib/platform/locale';
	import { cn } from '@rentable/design/tailwind.js';
	import type { ContractForm } from '$lib/contract/form';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { SuperForm } from 'sveltekit-superforms';

	/**
	 * The contract form's start date, picked on a calendar. The date itself is the form's, which
	 * writes it into the field and calculates the end date from it.
	 */
	let {
		superform,
		value = $bindable(),
		open = $bindable()
	}: {
		superform: SuperForm<ContractForm>;
		/** the date picked, which the form fills as it opens. */
		value: CalendarDate | undefined;
		/** whether the calendar is open, which the form shuts as it opens and closes. */
		open: boolean;
	} = $props();

	const form = $derived(superform.form);
	const errors = $derived(superform.errors);

	const dateFormatter = $derived(
		new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' })
	);
</script>

<Form.Field form={superform} name="start" class="group relative">
	<Form.Control>
		<Form.Label>{$LL.contracts.form.startDate()}</Form.Label>
		<input type="hidden" name="start" value={$form.start} />
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="outline"
						class={cn(
							'w-full justify-between font-normal',
							insetControl,
							!value && 'text-muted-foreground'
						)}
						aria-invalid={$errors.start ? 'true' : undefined}
					>
						<span>{formatCalendarDate(value, dateFormatter, $LL.contracts.form.pickDate())}</span>
						<ChevronDownIcon class="size-4 opacity-50" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-auto p-0" align="start" collisionPadding={16}>
				<Calendar.Calendar
					type="single"
					bind:value
					captionLayout="dropdown"
					locale={getIntlLocale($locale)}
				/>
			</Popover.Content>
		</Popover.Root>
	</Form.Control>
	<FieldError />
</Form.Field>
