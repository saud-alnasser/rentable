<script lang="ts">
	import type { Payment } from '$lib/api/database/schema';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Calendar from '$lib/common/components/fragments/calendar';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import * as Popover from '$lib/common/components/fragments/popover';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { useCreatePayment, useUpdatePayment } from '$lib/resources/contracts/hooks/queries';
	import {
		DateFormatter,
		getLocalTimeZone,
		parseDate,
		type CalendarDate
	} from '@internationalized/date';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	const PaymentFormSchema = z.object({
		date: z.string().min(1, 'payment date is required'),
		amount: z
			.string()
			.trim()
			.min(1, 'payment amount is required')
			.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
				message: 'payment amount must be greater than zero'
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

	const formatDateInput = (value: number) => new Date(value).toISOString().slice(0, 10);
	const parseDateInput = (value: string) => {
		const [year, month, day] = value.split('-').map(Number);
		return Date.UTC(year, month - 1, day);
	};
	const dateFormatter = new DateFormatter('en-GB', { dateStyle: 'medium' });
	const parseCalendarDate = (value: string): CalendarDate | undefined => {
		if (!value) return undefined;

		try {
			return parseDate(value);
		} catch {
			return undefined;
		}
	};
	const formatCalendarDate = (value: CalendarDate | undefined) =>
		value ? dateFormatter.format(value.toDate(getLocalTimeZone())) : 'pick a date';

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
							setError(form, 'amount', 'payment amount must be greater than zero');
						}
					} else {
						toast.error('unexpected error occurred!');
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
	<Dialog.Content class="w-full max-w-sm">
		<form method="POST" use:enhance class="flex flex-col gap-4">
			<Form.Field form={superform} name="date">
				<Form.Control>
					<Label>Payment date</Label>
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
									<span>{formatCalendarDate(paymentDateValue)}</span>
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
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={superform} name="amount">
				<Form.Control>
					<Label>Amount</Label>
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
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit" disabled={isPending} class="capitalize">
				{isEditMode ? (isPending ? 'saving...' : 'save') : isPending ? 'creating...' : 'create'}
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
