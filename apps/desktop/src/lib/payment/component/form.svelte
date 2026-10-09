<script lang="ts">
	import {
		PAYMENT_METHODS,
		type Payment,
		type PaymentDirection,
		type PaymentMethod
	} from '$lib/platform/database/schema';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Calendar from '@rentable/design/primitive/calendar/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import { Textarea } from '@rentable/design/primitive/textarea/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
	import {
		formatCalendarDate,
		formatDateInput,
		parseCalendarDate,
		parseDateInput,
		toCalendarDate
	} from '$lib/date';
	import { formatLocaleMoney, getIntlLocale, RIYAL, toWesternDigits } from '$lib/platform/locale';
	import { isWholeHalalas } from '@rentable/design/money.js';
	import { cn } from '@rentable/design/tailwind.js';
	import {
		getAmountDueThisCycle,
		getRefundableFromTotals,
		getRemainingContractBalance
	} from '$lib/contract';
	import { useFetchContract } from '$lib/contract/ui';
	import { onMutationError } from '$lib/mutation/ui';
	import { fieldOfFailure, toRefusalText } from '$lib/error/refusal';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		toPaymentCreateUnavailable,
		toRefundCreateUnavailable,
		whyNothingIsRefundable
	} from '$lib/payment/acts';
	import { unavailableControl } from '@rentable/design/block/record-action-control.svelte';
	import * as Tooltip from '@rentable/design/primitive/tooltip/index.js';
	import { paymentMethods } from '$lib/payment/method';
	import { useCreatePayment, useUpdatePayment } from '$lib/payment/query';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
	import BanknoteArrowDownIcon from '@lucide/svelte/icons/banknote-arrow-down';
	import BanknoteArrowUpIcon from '@lucide/svelte/icons/banknote-arrow-up';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import { TRPCError } from '@trpc/server';
	import { surfaceForm } from '$lib/form';
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
			// read in Western digits wherever it is parsed: the field keeps what was typed
			// (effort 854, requirement 21).
			.refine(
				(value) =>
					Number.isFinite(Number(toWesternDigits(value))) && Number(toWesternDigits(value)) > 0,
				{
					message: $LL.contracts.form.paymentAmountGreaterThanZero()
				}
			)
			.refine((value) => isWholeHalalas(toWesternDigits(value)), {
				message: $LL.contracts.form.paymentAmountDecimalPlaces()
			}),
		// none of the three is required: a payment recorded without them says so on its record.
		// The method is empty until one is chosen, and empty again once the chosen one is pressed.
		method: z.enum([...PAYMENT_METHODS, '']),
		reference: z.string(),
		note: z.string()
	});

	type PaymentForm = z.infer<typeof PaymentFormSchema>;

	const createMutation = useCreatePayment();
	const updateMutation = useUpdatePayment();

	let {
		contractId,
		value,
		direction: asked = 'received',
		open,
		onOpenChange,
		onCreated
	}: {
		contractId: string;
		/** the payment being edited, or the details a new one starts from when duplicating. */
		value?: Omit<Payment, 'id'> & { id?: string };
		/**
		 * which way a new payment's money goes: received from the tenant, or a refund returned to
		 * them (effort 854, requirements 25 and 26). An edit or a duplicate goes the way its payment
		 * went, since an edit never turns one into the other.
		 */
		direction?: PaymentDirection;
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/**
		 * a new record has been written: the host lands the reader where the next step is
		 * ([[rules/interface]], *Guidance*).
		 */
		onCreated?: (created: { id: string }) => void;
	} = $props();

	// the four ways a payment is made, worded where every surface reads them.
	const methods = $derived(paymentMethods($LL));

	let dateFormatter = $derived(new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' }));

	const getInitialForm = (payment?: typeof value): PaymentForm =>
		payment
			? {
					date: formatDateInput(payment.date),
					amount: String(payment.amount),
					method: payment.method ?? '',
					reference: payment.reference ?? '',
					note: payment.note ?? ''
				}
			: {
					date: formatDateInput(Date.now()),
					amount: '',
					method: '',
					reference: '',
					note: ''
				};

	let paymentDateValue = $state<CalendarDate | undefined>(undefined);
	// held here rather than left to the popover, as the contract's pickers are: a calendar left
	// open when the surface closes would otherwise open again with it.
	let isDatePickerOpen = $state(false);
	let isEditMode = $derived(Boolean(value?.id));
	// which way a new payment's money goes, chosen on the form's two tabs and opened on the one the
	// host asked for (effort 854, requirement 25). An edit or a duplicate goes the way its payment
	// went and draws no tabs, since an edit never turns one into the other.
	// taken from the host's ask as the form is built, not after: the surface puts the focus on the
	// chosen tab as it opens, and a tab chosen a moment later would leave it on the other one.
	let chosen = $state<PaymentDirection>(untrack(() => asked));
	const isChoosable = $derived(!value);
	const isRefund = $derived((value?.direction ?? chosen) === 'refund');
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
					amount: Number(toWesternDigits(form.data.amount)),
					// what was left blank is sent as nothing, so an edit that clears a field clears it.
					method: form.data.method || null,
					reference: form.data.reference.trim() || null,
					note: form.data.note.trim() || null
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
							direction: isRefund ? 'refund' : 'received',
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
						if (fieldOfFailure(e) === 'amount') {
							setError(form, 'amount', toRefusalText(e, $LL));
						} else {
							// what no field here holds is still said, through the shared handler, in the reader's words.
							onMutationError({ toast: { error: true } }, e);
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
			chosen = asked;
			reasonOpen = null;
			hasMovedByKeyboard = false;
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
	//
	// A refund is not filled: there is no ordinary one to confirm, and the most that may be returned
	// is a limit to stay within rather than the figure most readers want. The form states it instead.
	$effect(() => {
		const contract = contractQuery.data;

		if (!open || value || isRefund || !contract || isAmountFilled) {
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

	const enteredAmount = $derived(Number(toWesternDigits($form.amount)));
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

	// the most this refund may return, stated before an amount is typed, so the reader is guided to
	// a figure the workspace takes rather than refused one (effort 854, requirement 26). Read off the
	// contract's totals, with the refund being edited set aside; the procedure weighs the rows and
	// is still the authority, and its refusal lands under the amount.
	const refundable = $derived(
		contractQuery.data && isRefund
			? getRefundableFromTotals(contractQuery.data, value?.id ? value.amount : 0)
			: undefined
	);
	// why nothing may be refunded, where nothing may: the refund act's own choice, so the form and
	// the act read the same sentence.
	const refundWhy = $derived(
		contractQuery.data && isRefund
			? whyNothingIsRefundable(contractQuery.data, $LL, value?.id ? value.amount : 0)
			: undefined
	);
	// why each tab may not be chosen, where it may not: the create acts' own reasons, the ones the
	// ledger's plus and the command menu say (effort 854, requirement 25). A refused tab is dimmed
	// and says why on hover and focus, and cannot be chosen, so the reader never stands on a tab
	// whose create would only be refused ([[rules/interface]], *Guidance*).
	const tabRefusal = $derived<Record<PaymentDirection, string | undefined>>({
		received: isChoosable ? toPaymentCreateUnavailable(contractQuery.data, $LL) : undefined,
		refund: isChoosable ? toRefundCreateUnavailable(contractQuery.data, $LL) : undefined
	});
	// held against a contract that changes while the form is open: nothing is created from a tab
	// that has come to refuse.
	const isChosenRefused = $derived(isChoosable && Boolean(tabRefusal[chosen]));
	// what names a refused tab's reason to assistive technology, whether or not its tooltip is drawn.
	const tabReasonId = $props.id();
	// the refused tab whose reason is showing, and whether the reader has moved with the keyboard
	// since the form opened: a focus they moved shows the reason, the focus the surface places does
	// not.
	let reasonOpen = $state<PaymentDirection | null>(null);
	let hasMovedByKeyboard = $state(false);

	// a tab chosen starts its amount afresh: a payment is filled with what is due, a refund is not,
	// and a figure typed for one way the money goes is not the answer for the other.
	function choose(next: PaymentDirection) {
		if (next === chosen || tabRefusal[next]) {
			return;
		}

		chosen = next;
		isAmountFilled = false;
		$form.amount = '';
	}

	// opened on a tab the contract does not take, where it takes the other, the form stands on the
	// other: the host asks for the one the contract takes, and this holds once the contract is read.
	$effect(() => {
		const other: PaymentDirection = chosen === 'refund' ? 'received' : 'refund';

		if (open && isChoosable && tabRefusal[chosen] && !tabRefusal[other]) {
			untrack(() => choose(other));
		}
	});
</script>

<!-- one tab. Refused, it stays in its place and reachable, dimmed, and says why on hover and focus,
     as a refused control does everywhere; pressing it chooses nothing. -->
{#snippet tab(direction: PaymentDirection, words: string, Glyph: typeof BanknoteArrowDownIcon)}
	{@const refused = tabRefusal[direction]}
	<!-- the reason opens on hover and on focus the reader moved there, never on the focus the surface
	     places as it opens: the toggle group makes its first tab the one the keyboard enters by, so
	     that focus lands on the payment tab whichever is chosen. So the reason's opening is held
	     here, and the tooltip's own opening is only ever taken when it closes. -->
	<Tooltip.Root
		disabled={!refused}
		open={reasonOpen === direction}
		onOpenChange={(isOpen) => {
			if (!isOpen && reasonOpen === direction) {
				reasonOpen = null;
			}
		}}
	>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<ToggleGroup.Item
					{...props}
					onpointerenter={() => (reasonOpen = direction)}
					onpointerleave={() => (reasonOpen = null)}
					onfocus={() => {
						if (hasMovedByKeyboard) {
							reasonOpen = direction;
						}
					}}
					onblur={() => (reasonOpen = null)}
					type="button"
					value={direction}
					class={cn('flex-1', refused && unavailableControl)}
					data-direction={direction}
					data-unavailable={refused ? '' : undefined}
					aria-disabled={refused ? 'true' : undefined}
					aria-describedby={refused ? `${tabReasonId}-${direction}` : undefined}
					onclick={(event: MouseEvent) => {
						if (refused) {
							event.preventDefault();
						}
					}}
				>
					<Glyph aria-hidden="true" />
					{words}
					{#if refused}
						<span id={`${tabReasonId}-${direction}`} class="sr-only">{refused}</span>
					{/if}
				</ToggleGroup.Item>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="bottom" sideOffset={8}>
			<span data-unavailable-reason>{refused}</span>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={isRefund ? $LL.contracts.payments.refund.title() : $LL.common.labels.payment()}
>
	<!-- a key pressed in the form is the reader moving, so the focus it lands next shows a refused
	     tab's reason. Listened for on the way down, before the focus moves. -->
	<div class="flex flex-col gap-4" onkeydowncapture={() => (hasMovedByKeyboard = true)}>
		{#if isChoosable}
			<!-- the two ways money moves, as the form's two tabs: two exclusive values, all shown, so a
			     toggle group ([[contexts/desktop/components]]). Each carries its glyph, pointing the way
			     the money goes, beside its word. -->
			<ToggleGroup.Root
				type="single"
				variant="outline"
				size="sm"
				class="w-full"
				aria-label={$LL.contracts.payments.refund.kind()}
				value={chosen}
				onValueChange={(next) => {
					if (next) {
						choose(next as PaymentDirection);
					}
				}}
				data-payment-direction
			>
				{@render tab('received', $LL.common.labels.payment(), BanknoteArrowDownIcon)}
				{@render tab('refund', $LL.contracts.payments.refund.tag(), BanknoteArrowUpIcon)}
			</ToggleGroup.Root>
		{/if}

		{#if isRefund}
			<!-- the most this refund may return, above the field that decides it, where the payment's
			     balance stands on a payment; and why, where it is nothing. -->
			<div class="flex flex-col gap-1 rounded-2xl border border-primary/25 bg-primary/5 p-4">
				<span class="truncate text-xs text-muted-foreground">
					{$LL.contracts.payments.refund.limitHint()}
				</span>
				<span class="truncate font-medium tabular-nums" data-refund-limit>
					{refundable === undefined ? '—' : formatMoney(refundable)}
				</span>
				{#if refundWhy}
					<span class="text-xs text-muted-foreground" data-refund-why>{refundWhy}</span>
				{/if}
			</div>
		{:else}
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
		{/if}

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

		<Form.Field form={superform} name="method" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.contracts.payments.methodOptional()}</Form.Label>
				<!-- four exclusive choices, so a toggle group rather than a menu ([[rules/interface]],
				     *Field kinds*). None is pressed until the reader says, and pressing the one chosen
				     lets it go again: a payment need not say how it was made. -->
				<ToggleGroup.Root
					type="single"
					variant="outline"
					size="sm"
					class="w-full"
					aria-label={$LL.contracts.payments.method()}
					value={$form.method}
					onValueChange={(next) => {
						$form.method = (next ?? '') as PaymentMethod | '';
					}}
				>
					{#each methods as method (method.value)}
						<ToggleGroup.Item value={method.value} class="flex-1">
							{method.label}
						</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			</Form.Control>
			<FieldError />
		</Form.Field>

		<Form.Field form={superform} name="reference" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.contracts.payments.referenceOptional()}</Form.Label>
				<Input
					bind:value={$form.reference}
					autocomplete="off"
					placeholder={$LL.contracts.payments.referencePlaceholder()}
					class={insetControl}
					aria-invalid={$errors.reference ? 'true' : undefined}
					{...$constraints.reference}
				/>
			</Form.Control>
			<FieldError />
		</Form.Field>

		<Form.Field form={superform} name="note" class="group relative">
			<Form.Control>
				<Form.Label>{$LL.contracts.payments.noteOptional()}</Form.Label>
				<Textarea
					bind:value={$form.note}
					class={insetControl}
					aria-invalid={$errors.note ? 'true' : undefined}
					{...$constraints.note}
				/>
			</Form.Control>
			<FieldError />
		</Form.Field>
	</div>

	{#snippet actions({ requestClose })}
		<Button type="button" variant="outline" disabled={isPending} onclick={requestClose}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every submit carries one. -->
		<Button type="submit" disabled={isPending || isChosenRefused} class="capitalize">
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
