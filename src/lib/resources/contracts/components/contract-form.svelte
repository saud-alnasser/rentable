<script lang="ts">
	import { ContractSchema, type Contract } from '$lib/api/database/schema';
	import {
		getMinimumContractPeriodDays,
		hasValidContractPeriodForInterval
	} from '$lib/api/utils/contract-status';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Calendar from '$lib/common/components/fragments/calendar';
	import * as Command from '$lib/common/components/fragments/command';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import * as Popover from '$lib/common/components/fragments/popover';
	import * as Select from '$lib/common/components/fragments/select';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useCreateContract, useUpdateContract } from '$lib/resources/contracts/hooks/queries';
	import { useFetchTenant, useFetchTenants } from '$lib/resources/tenants/hooks/queries';
	import {
		DateFormatter,
		getLocalTimeZone,
		parseDate,
		type CalendarDate
	} from '@internationalized/date';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { TRPCError } from '@trpc/server';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { z } from 'zod';

	const intervals = [
		{
			value: '1m',
			get label() {
				return $LL.contracts.intervals.monthly();
			}
		},
		{
			value: '3m',
			get label() {
				return $LL.contracts.intervals.quarterly();
			}
		},
		{
			value: '6m',
			get label() {
				return $LL.contracts.intervals.semiAnnual();
			}
		},
		{
			value: '12m',
			get label() {
				return $LL.contracts.intervals.annual();
			}
		}
	] as const;

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
	};

	const MAX_VISIBLE_TENANTS = 20;
	const UTC_DAY_MS = 24 * 60 * 60 * 1000;

	const ContractFormSchema = z.object({
		id: z.number().optional(),
		govId: z.string().trim().optional().default(''),
		tenantId: z.string().min(1, $LL.contracts.form.tenantRequired()),
		interval: ContractSchema.shape.interval,
		cost: z
			.string()
			.trim()
			.min(1, $LL.contracts.form.costRequired())
			.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
				message: $LL.contracts.form.costGreaterThanZero()
			}),
		cycles: z
			.string()
			.trim()
			.min(1, $LL.contracts.form.cyclesRequired())
			.refine((value) => Number.isInteger(Number(value)) && Number(value) > 0, {
				message: $LL.contracts.form.cyclesGreaterThanZero()
			}),
		start: z.string().min(1, $LL.contracts.form.startDateRequired()),
		end: z.string().min(1, $LL.contracts.form.endDateRequired())
	});

	type ContractForm = z.infer<typeof ContractFormSchema>;

	const CreateMutation = useCreateContract();
	const UpdateMutation = useUpdateContract();

	let {
		value,
		open,
		onOpenChange
	}: {
		value?: Contract;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	const getInitialForm = (): ContractForm => ({
		id: undefined,
		govId: '',
		tenantId: '',
		interval: '1m',
		cost: '',
		cycles: '1',
		start: '',
		end: ''
	});

	const formatDateInput = (value: number) => new Date(value).toISOString().slice(0, 10);
	const parseDateInput = (value: string) => {
		const [year, month, day] = value.split('-').map(Number);
		return Date.UTC(year, month - 1, day);
	};
	const addDaysToDateValue = (value: CalendarDate, days: number): CalendarDate => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const nextValue = new Date(parseDateInput(value.toString()));
		nextValue.setUTCDate(nextValue.getUTCDate() + days);

		return parseDate(formatDateInput(nextValue.getTime()));
	};
	const getInclusiveDayCount = (start: CalendarDate, end: CalendarDate) =>
		Math.floor((parseDateInput(end.toString()) - parseDateInput(start.toString())) / UTC_DAY_MS) +
		1;
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
		value ? dateFormatter.format(value.toDate(getLocalTimeZone())) : $LL.contracts.form.pickDate();
	const getContractPeriodValidationMessage = (interval: Contract['interval']) =>
		$LL.contracts.form.periodMustMatchWholeCycles({
			days: getMinimumContractPeriodDays(interval),
			interval: intervalLabels[interval]()
		});
	const parseCycleCount = (value: string) => {
		const parsedValue = Number(value);

		if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
			return undefined;
		}

		return parsedValue;
	};
	const getCycleCountForContract = (
		start: CalendarDate | undefined,
		end: CalendarDate | undefined,
		interval: Contract['interval']
	) => {
		if (!start || !end) return '1';

		const intervalDayCount = getMinimumContractPeriodDays(interval);
		const inclusiveDayCount = getInclusiveDayCount(start, end);

		if (inclusiveDayCount < intervalDayCount) {
			return '1';
		}

		const cycleCount = inclusiveDayCount / intervalDayCount;

		return Number.isInteger(cycleCount)
			? String(cycleCount)
			: String(Math.max(Math.ceil(cycleCount), 1));
	};
	const getCalculatedEndDate = (
		start: CalendarDate | undefined,
		interval: Contract['interval'],
		cycles: string
	) => {
		const cycleCount = parseCycleCount(cycles);

		if (!start || !cycleCount) {
			return undefined;
		}

		return addDaysToDateValue(start, getMinimumContractPeriodDays(interval) * cycleCount - 1);
	};

	const toFormValue = (contract: Contract): ContractForm => ({
		id: contract.id,
		govId: contract.govId ?? '',
		tenantId: contract.tenantId.toString(),
		interval: contract.interval,
		cost: contract.cost.toString(),
		cycles: getCycleCountForContract(
			parseDate(formatDateInput(contract.start)),
			parseDate(formatDateInput(contract.end)),
			contract.interval
		),
		start: formatDateInput(contract.start),
		end: formatDateInput(contract.end)
	});

	const toPayload = (form: ContractForm) => ({
		...(() => {
			const start = parseDateInput(form.start);
			const end = parseDateInput(form.end);

			if (start <= end) {
				return { start, end };
			}

			return { start: end, end: start };
		})(),
		govId: form.govId || undefined,
		tenantId: Number(form.tenantId),
		interval: form.interval,
		cost: Number(form.cost)
	});

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<ContractForm>(
		defaults(zod4(ContractFormSchema)),
		{
			SPA: true,
			resetForm: false,
			validators: zod4(ContractFormSchema),
			onUpdate: async ({ form }) => {
				if (!form.valid) return;

				const payload = toPayload(form.data);

				if (!hasValidContractPeriodForInterval(payload)) {
					setError(form, 'end', getContractPeriodValidationMessage(form.data.interval));
					return;
				}

				if (value && form.data.id) {
					const normalizedCurrentGovId = value.govId || undefined;
					const unchanged =
						normalizedCurrentGovId === payload.govId &&
						value.tenantId === payload.tenantId &&
						value.interval === payload.interval &&
						value.cost === payload.cost &&
						value.start === payload.start &&
						value.end === payload.end;

					if (unchanged) {
						onOpenChange(false);
						return;
					}
				}

				try {
					if (form.data.id) {
						await UpdateMutation.mutateAsync({ id: form.data.id, ...payload });
					} else {
						await CreateMutation.mutateAsync(payload);
					}
					onOpenChange(false);
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						if (e.message.includes('government id')) {
							setError(form, 'govId', $LL.contracts.form.duplicateGovernmentId());
						} else if (e.message.includes('end date')) {
							setError(form, 'end', $LL.contracts.form.endDateAfterStart());
						} else if (e.message.includes('contract period')) {
							setError(form, 'end', getContractPeriodValidationMessage(form.data.interval));
						} else if (e.message.includes('cost')) {
							setError(form, 'cost', $LL.contracts.form.costPerPaymentGreaterThanZero());
						} else if (e.message.includes('tenant')) {
							setError(form, 'tenantId', $LL.contracts.form.invalidTenant());
						} else {
							toast.error(e.message);
						}
					} else {
						toast.error($LL.common.messages.unexpectedError());
					}
				}
			}
		}
	);

	let isTenantPickerOpen = $state(false);
	let tenantSearch = $state('');
	let contractStartDateValue = $state<CalendarDate | undefined>(undefined);
	let lastHydratedFormKey = $state<string | undefined>(undefined);
	let normalizedTenantSearch = $derived.by(() => tenantSearch.trim().toLowerCase());
	let hasTenantSearch = $derived.by(() => normalizedTenantSearch.length > 0);

	const tenantsQuery = useFetchTenants(() => ({ enabled: open }));

	const selectedTenantQuery = useFetchTenant(() => ({
		id: $form.tenantId ? Number($form.tenantId) : undefined,
		enabled: open && Boolean($form.tenantId)
	}));

	const toTenantOption = (tenant: {
		id: number;
		name: string;
		nationalId: string;
		phone: string;
	}) => ({
		id: tenant.id,
		tenantId: tenant.id.toString(),
		name: tenant.name,
		details: [tenant.nationalId, tenant.phone].filter(Boolean).join(' • '),
		searchValue: [tenant.name, tenant.nationalId, tenant.phone].filter(Boolean).join(' ')
	});

	let tenantOptions = $derived.by(() => {
		if (!hasTenantSearch) return [];

		return (tenantsQuery.data ?? [])
			.filter((tenant) =>
				[tenant.name, tenant.nationalId, tenant.phone]
					.filter(Boolean)
					.some((value) => value.toLowerCase().includes(normalizedTenantSearch))
			)
			.slice(0, MAX_VISIBLE_TENANTS)
			.map((tenant) => toTenantOption(tenant));
	});

	const selectTenant = (tenantId: string) => {
		$form.tenantId = tenantId;
		isTenantPickerOpen = false;
		tenantSearch = '';
	};

	let selectedTenant = $derived.by(() => {
		if (!$form.tenantId) return undefined;

		return (
			(tenantsQuery.data ?? [])
				.map((tenant) => toTenantOption(tenant))
				.find((tenant) => tenant.tenantId === $form.tenantId) ??
			(selectedTenantQuery.data ? toTenantOption(selectedTenantQuery.data) : undefined)
		);
	});
	let isTenantResultsLoading = $derived.by(
		() => hasTenantSearch && tenantsQuery.isLoading && (tenantsQuery.data ?? []).length === 0
	);
	let calculatedEndDate = $derived.by(() =>
		getCalculatedEndDate(contractStartDateValue, $form.interval, $form.cycles)
	);
	let calculatedEndDateValue = $derived.by(() => calculatedEndDate?.toString() ?? '');

	$effect(() => {
		if (!open) {
			lastHydratedFormKey = undefined;
			return;
		}

		isTenantPickerOpen = false;
		tenantSearch = '';

		const currentFormKey = value ? `edit:${value.id}` : 'create';

		if (lastHydratedFormKey === currentFormKey) {
			return;
		}

		const nextFormValue = value ? toFormValue(value) : getInitialForm();
		contractStartDateValue = parseCalendarDate(nextFormValue.start);
		form.set(nextFormValue);
		lastHydratedFormKey = currentFormKey;
	});

	$effect(() => {
		const nextStartValue = contractStartDateValue?.toString() ?? '';

		if ($form.start !== nextStartValue) {
			$form.start = nextStartValue;
		}
	});

	$effect(() => {
		if ($form.end !== calculatedEndDateValue) {
			$form.end = calculatedEndDateValue;
		}
	});

	$effect(() => {
		if (!isTenantPickerOpen) {
			tenantSearch = '';
		}
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content class="w-full sm:max-w-2xl">
		<form method="POST" use:enhance class="flex min-h-0 flex-col">
			<Dialog.Header>
				<Dialog.Title class="capitalize">{$LL.common.nav.contracts()}</Dialog.Title>
			</Dialog.Header>

			<div class="min-h-0 overflow-y-auto px-6 py-5">
				<div
					class="grid gap-4 rounded-2xl border border-border/60 bg-card/25 p-4 backdrop-blur-sm md:grid-cols-2 md:p-5"
				>
					<Form.Field form={superform} name="govId">
						<Form.Control>
							<Form.Label>{$LL.common.labels.governmentIdOptional()}</Form.Label>
							<Input
								bind:value={$form.govId}
								placeholder={$LL.common.labels.governmentIdOptional()}
								aria-invalid={$errors.govId ? 'true' : undefined}
								{...$constraints.govId}
							/>
						</Form.Control>
						<Form.Description />
					</Form.Field>

					<Form.Field form={superform} name="tenantId">
						<Form.Control>
							<Form.Label>{$LL.common.labels.tenant()}</Form.Label>
							<Popover.Root bind:open={isTenantPickerOpen}>
								<Popover.Trigger>
									{#snippet child({ props })}
										<Button
											{...props}
											variant="outline"
											class={cn(
												'w-full justify-between border-border/60 bg-background/80 font-normal shadow-sm',
												!selectedTenant && 'text-muted-foreground'
											)}
											aria-invalid={$errors.tenantId ? 'true' : undefined}
										>
											<span class="min-w-0 flex-1 truncate text-left">
												{selectedTenant?.name ||
													(selectedTenantQuery.isLoading
														? $LL.contracts.form.loadingTenant()
														: $LL.contracts.form.searchAndSelectTenant())}
											</span>
											<ChevronDownIcon class="size-4 shrink-0 opacity-50" />
										</Button>
									{/snippet}
								</Popover.Trigger>

								<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
									<Command.Root class="w-full" shouldFilter={false}>
										<Command.Input
											bind:value={tenantSearch}
											placeholder={$LL.contracts.form.searchTenantPlaceholder()}
										/>
										<Command.List>
											{#if !hasTenantSearch}
												<div class="p-3 text-sm text-muted-foreground">
													{$LL.contracts.form.startTypingTenantSearch()}
												</div>
											{:else if isTenantResultsLoading && tenantOptions.length === 0}
												<div class="p-3 text-sm text-muted-foreground">
													{$LL.contracts.form.loadingTenants()}
												</div>
											{:else if tenantOptions.length === 0}
												<div class="p-3 text-sm text-muted-foreground">
													{$LL.contracts.form.noTenantFound()}
												</div>
											{:else}
												<Command.Group>
													{#each tenantOptions as tenant (tenant.id)}
														<Command.Item
															value={tenant.tenantId}
															onSelect={() => selectTenant(tenant.tenantId)}
														>
															<div class="flex min-w-0 flex-1 flex-col text-left">
																<span class="truncate">{tenant.name}</span>
																{#if tenant.details}
																	<span class="truncate text-xs text-muted-foreground">
																		{tenant.details}
																	</span>
																{/if}
															</div>
															<CheckIcon
																class={cn(
																	'ms-auto size-4',
																	$form.tenantId === tenant.tenantId ? 'opacity-100' : 'opacity-0'
																)}
															/>
														</Command.Item>
													{/each}
												</Command.Group>
											{/if}
										</Command.List>
									</Command.Root>
								</Popover.Content>
							</Popover.Root>
						</Form.Control>
						<Form.Description />
					</Form.Field>

					<div class="md:col-span-2">
						<div
							class="grid gap-4 rounded-[1.35rem] border border-border/50 bg-background/28 p-4 md:grid-cols-2"
						>
							<Form.Field form={superform} name="interval">
								<Form.Control>
									<Form.Label>{$LL.common.labels.cycle()}</Form.Label>
									<Select.Root type="single" bind:value={$form.interval}>
										<Select.Trigger
											class="w-full"
											aria-invalid={$errors.interval ? 'true' : undefined}
										>
											{intervalLabels[$form.interval]()}
										</Select.Trigger>
										<Select.Content>
											{#each intervals as interval (interval.value)}
												<Select.Item value={interval.value} label={interval.label} />
											{/each}
										</Select.Content>
									</Select.Root>
								</Form.Control>
								<Form.Description />
							</Form.Field>

							<Form.Field form={superform} name="start">
								<Form.Control>
									<Form.Label>{$LL.contracts.form.startDate()}</Form.Label>
									<input type="hidden" name="start" value={$form.start} />
									<Popover.Root>
										<Popover.Trigger>
											{#snippet child({ props })}
												<Button
													{...props}
													type="button"
													variant="outline"
													class={cn(
														'w-full justify-between border-border/60 bg-background/58 font-normal shadow-none',
														!contractStartDateValue && 'text-muted-foreground'
													)}
													aria-invalid={$errors.start ? 'true' : undefined}
												>
													<span>{formatCalendarDate(contractStartDateValue)}</span>
													<ChevronDownIcon class="size-4 opacity-50" />
												</Button>
											{/snippet}
										</Popover.Trigger>
										<Popover.Content class="w-auto p-0" align="start" collisionPadding={16}>
											<Calendar.Calendar
												type="single"
												bind:value={contractStartDateValue}
												captionLayout="dropdown"
											/>
										</Popover.Content>
									</Popover.Root>
								</Form.Control>
								<Form.Description />
							</Form.Field>

							<Form.Field form={superform} name="cycles">
								<Form.Control>
									<Form.Label>{$LL.contracts.form.numberOfCycles()}</Form.Label>
									<Input
										type="number"
										min="1"
										step="1"
										value={$form.cycles}
										oninput={(event) => {
											$form.cycles = event.currentTarget.value;
										}}
										placeholder="1"
										aria-invalid={$errors.cycles ? 'true' : undefined}
										{...$constraints.cycles}
									/>
								</Form.Control>
								<Form.Description />
							</Form.Field>

							<Form.Field form={superform} name="end">
								<Form.Control>
									<Form.Label>{$LL.contracts.form.calculatedEndDate()}</Form.Label>
									<input type="hidden" name="end" value={$form.end} />
									<Input
										value={calculatedEndDate ? formatCalendarDate(calculatedEndDate) : ''}
										placeholder={$LL.contracts.form.pickDate()}
										readonly
										aria-invalid={$errors.end ? 'true' : undefined}
										class="cursor-default bg-background/36 text-foreground/90 hover:bg-background/36"
									/>
								</Form.Control>
								<Form.Description>
									{$LL.contracts.form.calculatedEndDateHint()}
								</Form.Description>
							</Form.Field>
						</div>
					</div>

					<Form.Field form={superform} name="cost" class="md:col-span-2">
						<Form.Control>
							<Form.Label>{$LL.common.labels.costPerPayment()}</Form.Label>
							<Input
								type="number"
								min="0.01"
								step="0.01"
								value={$form.cost}
								oninput={(event) => {
									$form.cost = event.currentTarget.value;
								}}
								placeholder="0.00"
								aria-invalid={$errors.cost ? 'true' : undefined}
								{...$constraints.cost}
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
					disabled={CreateMutation.isPending || UpdateMutation.isPending}
					onclick={() => onOpenChange(false)}
				>
					{$LL.common.actions.cancel()}
				</Button>
				<Button
					type="submit"
					disabled={CreateMutation.isPending || UpdateMutation.isPending}
					class="capitalize"
				>
					{value?.id ? $LL.common.actions.update() : $LL.common.actions.create()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
