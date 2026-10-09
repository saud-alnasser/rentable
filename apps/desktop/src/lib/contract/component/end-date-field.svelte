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
	import { CONTRACT_END_DATE_TOLERANCE_DAYS } from '$lib/contract/schedule/cycle';
	import {
		isContractEndDateWithinWindow,
		type ContractEndDateWindow
	} from '$lib/contract/schedule/end-date';
	import type { ContractForm } from '$lib/contract/form';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import type { SuperForm } from 'sveltekit-superforms';

	/**
	 * The contract form's end date: the one the start, the cycle and the number of cycles
	 * calculate, which the reader may move within the end-date tolerance. What the form remembers
	 * about it, and when a move survives, is the form's (`contract/schedule/end-date.ts`); this
	 * draws it, and marks the days a move may land on.
	 */
	let {
		superform,
		value = $bindable(),
		open = $bindable(),
		start,
		calculated,
		endWindow,
		isManuallyEdited
	}: {
		superform: SuperForm<ContractForm>;
		/** the date showing, which the form fills and recalculates. */
		value: CalendarDate | undefined;
		/** whether the calendar is open, which the form shuts when the date is recalculated. */
		open: boolean;
		/** the start date, where the calendar opens while there is no end date to open on. */
		start: CalendarDate | undefined;
		/** the end date the inputs calculate, marked as the suggestion. */
		calculated: CalendarDate | undefined;
		/** the range a move may land in; absent while the inputs are incomplete. */
		endWindow: ContractEndDateWindow | undefined;
		/** whether the date showing is a move away from the calculated one. */
		isManuallyEdited: boolean;
	} = $props();

	const form = $derived(superform.form);
	const errors = $derived(superform.errors);

	const dateFormatter = $derived(
		new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' })
	);
</script>

<Form.Field form={superform} name="end" class="group relative">
	<Form.Control>
		<Form.Label>{$LL.contracts.form.calculatedEndDate()}</Form.Label>
		<input type="hidden" name="end" value={$form.end} />
		<Popover.Root bind:open>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						type="button"
						variant="outline"
						disabled={!endWindow?.start || !endWindow?.end}
						class={cn(
							'w-full justify-between font-normal',
							insetControl,
							!value && 'text-muted-foreground',
							isManuallyEdited && 'border-permitted/40 bg-permitted/6 text-permitted'
						)}
						aria-invalid={$errors.end ? 'true' : undefined}
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
					placeholder={value ?? calculated ?? start}
					captionLayout="dropdown"
					locale={getIntlLocale($locale)}
					minValue={endWindow?.start}
					maxValue={endWindow?.end}
				>
					{#snippet day({ day })}
						{@const isAllowedManualDate = endWindow
							? isContractEndDateWithinWindow(day, endWindow)
							: false}
						{@const isSuggestedDate = calculated ? day.compare(calculated) === 0 : false}
						<Calendar.Day
							class={cn(
								isAllowedManualDate &&
									'rounded-full border border-permitted/45 text-permitted hover:bg-permitted/10 data-[selected]:border-permitted-fill data-[selected]:bg-permitted-fill data-[selected]:text-permitted-foreground data-[selected]:hover:bg-permitted-fill',
								isSuggestedDate &&
									'border-permitted bg-permitted/20 font-medium text-permitted ring-1 ring-permitted/35 data-[selected]:border-permitted-fill data-[selected]:bg-permitted-fill data-[selected]:text-permitted-foreground data-[selected]:hover:bg-permitted-fill'
							)}
						/>
					{/snippet}
				</Calendar.Calendar>
			</Popover.Content>
		</Popover.Root>
	</Form.Control>
	<Form.Description>
		{$LL.contracts.form.calculatedEndDateHint({
			days: CONTRACT_END_DATE_TOLERANCE_DAYS
		})}
	</Form.Description>
	<FieldError />
</Form.Field>
