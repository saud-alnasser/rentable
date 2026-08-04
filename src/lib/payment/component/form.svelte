<script lang="ts">
	import type { Payment } from '$lib/platform/database/schema';
	import { Button } from '$lib/design/primitive/button';
	import * as Calendar from '$lib/design/primitive/calendar';
	import * as Dialog from '$lib/design/primitive/dialog';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import * as Popover from '$lib/design/primitive/popover';
	import {
		formatCalendarDate,
		formatDateInput,
		parseCalendarDate,
		parseDateInput
	} from '$lib/design/date';
	import { getIntlLocale } from '$lib/platform/locale';
	import { cn } from '$lib/design/tailwind.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useCreatePayment, useUpdatePayment } from '$lib/payment/query';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
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
	});

	type PaymentForm = z.infer<typeof PaymentFormSchema>;

	const createMutation = useCreatePayment();
	const updateMutation = useUpdatePayment();

	let {
		contractId,
		value,
		open,
		onOpenChange
	}: {
		contractId: number;
		value?: Payment;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	let dateFormatter = $derived(new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' }));

	const getInitialForm = (payment?: Payment): PaymentForm =>
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
	let isEditMode = $derived(Boolean(value));
	let isPending = $derived(createMutation.isPending || updateMutation.isPending);

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<PaymentForm>(
		defaults(zod4(PaymentFormSchema)),
		{
			SPA: true,
			validators: zod4(PaymentFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				const payload = {
					date: parseDateInput(form.data.date),
					amount: Number(form.data.amount)
				};

				try {
					if (value) {
						await updateMutation.mutateAsync({
							id: value.id,
							...payload
						});
					} else {
						await createMutation.mutateAsync({
							contractId,
							...payload
						});
					}

					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (e.message.includes('amount')) {
							setError(form, 'amount', $LL.contracts.form.paymentAmountGreaterThanZero());
						}
					} else {
						toast.error($LL.common.messages.unexpectedError());
					}
				}
			}
		}
	);

	$effect(() => {
		if (open) {
			const nextFormValue = getInitialForm(value);
			paymentDateValue = parseCalendarDate(nextFormValue.date);
			form.set(nextFormValue);
		}
	});

	$effect(() => {
		$form.date = paymentDateValue?.toString() ?? '';
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="w-full sm:max-w-md">
		<form method="POST" use:enhance class="flex flex-col">
			<Dialog.Header>
				<Dialog.Title class="capitalize">{$LL.common.labels.payment()}</Dialog.Title>
			</Dialog.Header>

			<div class="px-6 py-5">
				<div class="flex flex-col gap-4 rounded-2xl border bg-muted p-4">
					<Form.Field form={superform} name="date">
						<Form.Control>
							<Form.Label>{$LL.common.labels.paymentDate()}</Form.Label>
							<input type="hidden" name="date" value={$form.date} />
							<Popover.Root>
								<Popover.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											type="button"
											variant="outline"
											class={cn(
												'w-full justify-between font-normal',
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
								<Popover.Content class="w-auto p-0" align="start">
									<Calendar.Calendar
										type="single"
										bind:value={paymentDateValue}
										captionLayout="dropdown"
									/>
								</Popover.Content>
							</Popover.Root>
						</Form.Control>
						<Form.Description />
					</Form.Field>

					<Form.Field form={superform} name="amount">
						<Form.Control>
							<Form.Label>{$LL.common.labels.amount()}</Form.Label>
							<Input
								type="number"
								min="0.01"
								step="0.01"
								value={$form.amount}
								oninput={(event) => {
									$form.amount = event.currentTarget.value;
								}}
								placeholder="0.00"
								aria-invalid={$errors.amount ? 'true' : undefined}
								{...$constraints.amount}
							/>
						</Form.Control>
						<Form.Description />
					</Form.Field>
				</div>

				<Form.ErrorsSummary errors={$errors} class="mt-4" />
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					variant="outline"
					disabled={isPending}
					onclick={() => onOpenChange(false)}
				>
					{$LL.common.actions.cancel()}
				</Button>
				<Button type="submit" disabled={isPending} class="capitalize">
					{isEditMode
						? isPending
							? $LL.common.actions.saving()
							: $LL.common.actions.save()
						: isPending
							? $LL.common.actions.creating()
							: $LL.common.actions.create()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
