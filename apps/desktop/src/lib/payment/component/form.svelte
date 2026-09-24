<script lang="ts">
	import type { Payment } from '$lib/platform/database/schema';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Calendar from '@rentable/design/primitive/calendar/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import {
		formatCalendarDate,
		formatDateInput,
		parseCalendarDate,
		parseDateInput,
		toCalendarDate
	} from '$lib/design/date';
	import { formatLocaleMoney, getIntlLocale, RIYAL } from '$lib/platform/locale';
	import { isWholeHalalas } from '@rentable/design/money.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { getAmountDueThisCycle, getRemainingContractBalance } from '$lib/contract/contract';
	import { useFetchContract } from '$lib/contract/query';
	import { fieldOfRefusal, readRefusal, toRefusalText } from '$lib/error/refusal';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useCreatePayment, useUpdatePayment } from '$lib/payment/query';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import { TRPCError } from '@trpc/server';
	import { surfaceForm } from '$lib/design/form';
	import { untrack } from 'svelte';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';

	const PaymentFormSchema = z.object({
		date: z.string().min(1, $LL.contracts.form.paymentDateRequired()),
		amount: z
			.string()
			.trim()
			.min(1, $LL.contracts.form.paymentAmountRequired())
			.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
				message: $LL.contracts.form.paymentAmountGreaterThanZero()
			})
			.refine(isWholeHalalas, {
				message: $LL.contracts.form.paymentAmountDecimalPlaces()
			})
	});

	type PaymentForm = z.infer<typeof PaymentFormSchema>;

	const createMutation = useCreatePayment();
	const updateMutation = useUpdatePayment();

	let {
		contractId,
		value,
		open,
		onOpenChange,
		onCreated
	}: {
		contractId: string;
		/** the payment being edited, or the details a new one starts from when duplicating. */
		value?: Omit<Payment, 'id'> & { id?: string };
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/**
		 * a new record has been written: the host lands the reader where the next step is
		 * ([[rules/interface]], *Guidance*).
		 */
		onCreated?: (created: { id: string }) => void;
	} = $props();

	let dateFormatter = $derived(new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' }));

	const getInitialForm = (payment?: typeof value): PaymentForm =>
		payment
			? {
					date: formatDateInput(payment.date),
					amount: String(payment.amount)
				}
			: {
					date: formatDateInput(Date.now()),
					amount: ''
				};

	let paymentDateValue = $state<CalendarDate | undefined>(undefined);
	// held here rather than left to the popover, as the contract's pickers are: a calendar left
	// open when the surface closes would otherwise open again with it.
	let isDatePickerOpen = $state(false);
	let isEditMode = $derived(Boolean(value?.id));
	let isPending = $derived(createMutation.isPending || updateMutation.isPending);

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<PaymentForm>(
		defaults(zod4(PaymentFormSchema)),
		{
			...surfaceForm,
			validators: zod4(PaymentFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				const payload = {
					date: parseDateInput(form.data.date),
					amount: Number(form.data.amount)
				};

				submittedRemaining = projectedRemaining;

				try {
					// the identity decides, not the presence of a value: a duplicate arrives with
					// everything the record had except that.
					if (value?.id) {
						await updateMutation.mutateAsync({
							id: value.id,
							...payload
						});
					} else {
						const created = await createMutation.mutateAsync({
							contractId,
							...payload
						});

						onCreated?.(created);
					}

					onOpenChange(false);
				} catch (e) {
					// nothing landed, so the projection is a live question again.
					submittedRemaining = undefined;

					// an unexpected failure is the shared error handler's to report, and it already has:
					// what is left here is the refusal, mapped onto the field the reader would fix.
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (fieldOfRefusal(readRefusal(e)?.code) === 'amount') {
							setError(form, 'amount', toRefusalText(e, $LL));
						}
					}
				}
			}
		}
	);

	// the last day a payment may be dated. A payment records money already received, so the
	// procedure refuses a later one; offering it here and refusing it on submit would make the
	// reader discover the rule by breaking it.
	//
	// Read when the surface opens rather than once when it is built: this is a desktop window that
	// stays open for days, and the bound has to be the day the procedure will compare against. It
	// is the UTC day for the same reason — that is the comparison the rule makes.
	let latestPaymentDate = $state<CalendarDate | undefined>(undefined);

	// whether this opening has had its amount filled. Plain rather than state: it is read and
	// written by the effect below and nothing draws it.
	let isAmountFilled = false;

	$effect(() => {
		isDatePickerOpen = false;

		if (open) {
			isAmountFilled = false;
			const nextFormValue = getInitialForm(value);
			paymentDateValue = parseCalendarDate(nextFormValue.date);
			latestPaymentDate = toCalendarDate(new Date());
			submittedRemaining = undefined;
			form.set(nextFormValue);
		}
	});

	$effect(() => {
		$form.date = paymentDateValue?.toString() ?? '';
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	const contractQuery = useFetchContract(() => contractId);
	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// what the contract still owes, and what it would owe once this payment lands. The amount
	// being typed is the one figure a reader cannot check against anything else on the surface,
	// and getting it wrong is a correction rather than a mistake they notice.
	const remaining = $derived(
		contractQuery.data
			? getRemainingContractBalance(
					contractQuery.data.paidAmount,
					contractQuery.data.expectedAmount
				)
			: undefined
	);
	// a new payment opens on today and on what is due this cycle, capped at what the contract still
	// owes ([[rules/interface]], *Guidance*): the reader recording an ordinary rent confirms two
	// figures rather than typing them. The amount waits for the contract to be read, is filled once
	// per opening, and never over anything the reader has typed. An edit or a duplicate opens on
	// the payment it came from instead.
	$effect(() => {
		const contract = contractQuery.data;

		if (!open || value || !contract || isAmountFilled) {
			return;
		}

		isAmountFilled = true;

		const due = getAmountDueThisCycle(contract, Date.now());

		untrack(() => {
			if (due > 0 && $form.amount === '') {
				$form.amount = String(due);
			}
		});
	});

	const enteredAmount = $derived(Number($form.amount));
	const hasEnteredAmount = $derived(Number.isFinite(enteredAmount) && enteredAmount > 0);

	// what this payment already contributes to the contract's paid figure. Editing one replaces
	// that contribution rather than adding to it, and the contract's stored figure already holds
	// it — so subtracting the typed amount from the balance as it stands would count the payment
	// twice, and retyping the same amount would appear to pay the contract down again.
	//
	// A duplicate carries the details without the identity, and contributes nothing yet.
	const committedAmount = $derived(value?.id ? value.amount : 0);

	// computed from the contract's own figures rather than by adjusting the balance above, so a
	// contract already paid in full reads correctly: that balance is floored at zero, and an edit
	// that lowers a payment has to be able to lift it back off the floor.
	const projectedRemaining = $derived.by(() => {
		const contract = contractQuery.data;

		if (!contract) return undefined;

		const paidAfter =
			contract.paidAmount - committedAmount + (hasEnteredAmount ? enteredAmount : 0);

		return getRemainingContractBalance(paidAfter, contract.expectedAmount);
	});

	// what the projection said when this payment was submitted, held until the surface reopens.
	//
	// The contract's own paid figure is about to include this payment, while the typed amount is
	// still on screen and still being projected onto it — so between the write landing and the
	// surface closing the payment is counted twice, and the reader watches the figure overshoot
	// by the amount they just entered. Holding it is what makes that window unobservable, and it
	// costs nothing in truth: the figure was already the answer for the payment that landed.
	let submittedRemaining = $state<number | undefined>(undefined);

	const remainingAfter = $derived(submittedRemaining ?? projectedRemaining);
</script>

<FormSurface {open} {onOpenChange} {enhance} weight="light" title={$LL.common.labels.payment()}>
	<div class="flex flex-col gap-4">
		<!-- what this payment does to the contract, above the field that decides it. -->
		<div class="grid grid-cols-2 gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
			<div class="flex min-w-0 flex-col">
				<span class="truncate text-xs text-muted-foreground">
					{$LL.contracts.payments.remainingBalance()}
				</span>
				<span class="truncate font-medium tabular-nums">
					{remaining === undefined ? '—' : formatMoney(remaining)}
				</span>
			</div>
			<div class="flex min-w-0 flex-col">
				<span class="truncate text-xs text-muted-foreground">
					{$LL.contracts.payments.remainingAfter()}
				</span>
				<span class="truncate font-medium tabular-nums">
					{remainingAfter === undefined ? '—' : formatMoney(remainingAfter)}
				</span>
			</div>
		</div>

		<Form.Field form={superform} name="date" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.labels.paymentDate()}</Form.Label>
				<input type="hidden" name="date" value={$form.date} />
				<Popover.Root bind:open={isDatePickerOpen}>
					<Popover.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								type="button"
								variant="outline"
								class={cn(
									'w-full justify-between font-normal',
									insetControl,
									!paymentDateValue && 'text-muted-foreground'
								)}
								aria-invalid={$errors.date ? 'true' : undefined}
							>
								<span
									>{formatCalendarDate(
										paymentDateValue,
										dateFormatter,
										$LL.contracts.form.pickDate()
									)}</span
								>
								<ChevronDownIcon class="size-4 opacity-50" />
							</Button>
						{/snippet}
					</Popover.Trigger>
					<Popover.Content class="w-auto p-0" align="start" collisionPadding={16}>
						<Calendar.Calendar
							type="single"
							bind:value={paymentDateValue}
							maxValue={latestPaymentDate}
							captionLayout="dropdown"
							locale={getIntlLocale($locale)}
						/>
					</Popover.Content>
				</Popover.Root>
			</Form.Control>
			<FieldError />
		</Form.Field>

		<Form.Field form={superform} name="amount" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.common.labels.amount()}</Form.Label>
				<!-- money: the riyal sign as the adornment and the decimal keypad, left to right in
				     both locales as every amount is drawn ([[rules/interface]], *Field kinds*). -->
				<InputGroup.Root class={insetControl} dir="ltr">
					<InputGroup.Addon>{RIYAL}</InputGroup.Addon>
					<InputGroup.Input
						inputmode="decimal"
						autocomplete="off"
						value={$form.amount}
						oninput={(event) => {
							$form.amount = event.currentTarget.value;
						}}
						placeholder="0.00"
						aria-invalid={$errors.amount ? 'true' : undefined}
						{...$constraints.amount}
					/>
				</InputGroup.Root>
			</Form.Control>
			<FieldError />
		</Form.Field>
	</div>

	{#snippet actions()}
		<Button
			type="button"
			variant="outline"
			disabled={isPending}
			onclick={() => onOpenChange(false)}
		>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every submit carries one. -->
		<Button type="submit" disabled={isPending} class="capitalize">
			{#if isEditMode}
				<SaveIcon class="size-4" />
				{isPending ? $LL.common.actions.saving() : $LL.common.actions.save()}
			{:else}
				<PlusIcon class="size-4" />
				{isPending ? $LL.common.actions.creating() : $LL.common.actions.create()}
			{/if}
		</Button>
	{/snippet}
</FormSurface>
