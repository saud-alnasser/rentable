<script lang="ts">
	import { ContractSchema, type Contract } from '$lib/platform/database/schema';
	import { Button } from '$lib/design/primitive/button';
	import * as Calendar from '$lib/design/primitive/calendar';
	import * as Command from '$lib/design/primitive/command';
	import FieldError from '$lib/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '$lib/design/block/form-surface.svelte';
	import * as Form from '$lib/design/primitive/form';
	import { Input } from '$lib/design/primitive/input';
	import * as Popover from '$lib/design/primitive/popover';
	import * as Select from '$lib/design/primitive/select';
	import {
		formatCalendarDate,
		formatDateInput,
		parseCalendarDate,
		parseDateInput,
		toCalendarDate
	} from '$lib/design/date';
	import { formatLocaleMoney, getIntlLocale } from '$lib/platform/locale';
	import { isWholeHalalas } from '$lib/design/money';
	import { cn } from '$lib/design/tailwind.js';
	import {
		CONTRACT_END_DATE_TOLERANCE_DAYS,
		hasValidContractPeriodForInterval
	} from '$lib/contract/contract';
	import {
		createContractEndDateState,
		getCalculatedContractEndDate,
		getContractCycleCount,
		getContractEndDateCalculationKey,
		getManualContractEndDateWindow,
		hydrateContractEndDateState,
		isContractEndDateWithinWindow,
		observeContractEndDate,
		observeContractEndDateInputs
	} from '$lib/contract/end-date';
	import { getContractRenewalTerm } from '$lib/contract/renewal';
	import {
		useCreateContract,
		useFetchContract,
		useRenewContract,
		useUpdateContract
	} from '$lib/contract/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useFetchTenant, useFetchTenants } from '$lib/tenant/query';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
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

	const ContractFormSchema = z.object({
		id: z.string().optional(),
		govId: z.string().trim().optional().default(''),
		tenantId: z.string().min(1, $LL.contracts.form.tenantRequired()),
		interval: ContractSchema.shape.interval,
		cost: z
			.string()
			.trim()
			.min(1, $LL.contracts.form.costRequired())
			.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
				message: $LL.contracts.form.costGreaterThanZero()
			})
			.refine(isWholeHalalas, {
				message: $LL.contracts.form.costDecimalPlaces()
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
	const RenewMutation = useRenewContract();

	let {
		value,
		renewsContractId,
		open,
		onOpenChange
	}: {
		/**
		 * the contract being edited, or the details a new one starts from when duplicating —
		 * which is the same shape without an identity, because everything else transfers.
		 */
		value?: Omit<Contract, 'id'> & { id?: string };
		/**
		 * the contract being renewed, where the form was opened to renew one.
		 *
		 * Only its identity is given, because everything the successor carries is read off the
		 * predecessor rather than assembled by whoever opened the form — three surfaces offer
		 * renewal and one of them holds nothing but the id.
		 */
		renewsContractId?: string;
		open: boolean;
		onOpenChange: (value: boolean) => void;
	} = $props();

	const isRenewing = $derived(renewsContractId !== undefined);
	const predecessorQuery = useFetchContract(
		() => renewsContractId ?? '',
		() => open && isRenewing
	);
	const predecessor = $derived(predecessorQuery.data);

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

	let dateFormatter = $derived(new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' }));
	const getContractPeriodValidationMessage = (interval: Contract['interval']) =>
		$LL.contracts.form.periodMustMatchWholeCycles({
			days: CONTRACT_END_DATE_TOLERANCE_DAYS,
			interval: intervalLabels[interval]()
		});
	const closeContractForm = () => {
		isTenantPickerOpen = false;
		isStartDatePickerOpen = false;
		isEndDatePickerOpen = false;
		tenantSearch = '';
		lastHydratedFormKey = undefined;
		endDateState = createContractEndDateState();
		onOpenChange(false);
	};

	const toFormValue = (contract: NonNullable<typeof value>): ContractForm => ({
		id: contract.id,
		govId: contract.govId ?? '',
		tenantId: contract.tenantId.toString(),
		interval: contract.interval,
		cost: contract.cost.toString(),
		cycles: getContractCycleCount(
			toCalendarDate(contract.start),
			toCalendarDate(contract.end),
			contract.interval
		),
		start: formatDateInput(contract.start),
		end: formatDateInput(contract.end)
	});

	/**
	 * The successor a renewal starts from: the predecessor's tenant, cycle and cost, over the
	 * term the domain proposes. Only that term is the user's to move, so the fields carrying the
	 * other three are shown and locked rather than left out — a renewal that quietly dropped the
	 * cost off the surface would be asking the reader to trust a figure they cannot see.
	 */
	const toRenewalFormValue = (contract: NonNullable<typeof predecessor>): ContractForm => {
		const term = getContractRenewalTerm(contract);

		return {
			id: undefined,
			// a government id is unique to one contract, so the successor starts without the
			// predecessor's rather than with a value that cannot be saved.
			govId: '',
			tenantId: contract.tenantId.toString(),
			interval: contract.interval,
			cost: contract.cost.toString(),
			cycles: String(term.cycles),
			start: formatDateInput(term.start),
			end: formatDateInput(term.end)
		};
	};

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
		tenantId: form.tenantId,
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
						closeContractForm();
						return;
					}
				}

				try {
					if (renewsContractId !== undefined) {
						// the term and the reference are the whole of what a renewal is asked for;
						// the tenant, the units, the cycle and the cost are the predecessor's and
						// the procedure reads them off it.
						await RenewMutation.mutateAsync({
							contractId: renewsContractId,
							govId: payload.govId,
							start: payload.start,
							end: payload.end
						});
					} else if (form.data.id) {
						await UpdateMutation.mutateAsync({ id: form.data.id, ...payload });
					} else {
						await CreateMutation.mutateAsync(payload);
					}
					closeContractForm();
				} catch (e) {
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						// both renewal refusals are about the term, so each marks the end of it the
						// reader has to move — a refusal shown as a banner names the problem and
						// never the field.
						if (e.message.includes('already assigned to an overlapping contract')) {
							setError(form, 'end', $LL.contracts.form.renewalUnitsUnavailable());
						} else if (e.message.includes('renewal must start after')) {
							setError(form, 'start', $LL.contracts.form.renewalMustFollowOriginal());
						} else if (e.message.includes('government id')) {
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
	let isStartDatePickerOpen = $state(false);
	let isEndDatePickerOpen = $state(false);
	let tenantSearch = $state('');
	let contractStartDateValue = $state<CalendarDate | undefined>(undefined);
	let contractEndDateValue = $state<CalendarDate | undefined>(undefined);
	let lastHydratedFormKey = $state<string | undefined>(undefined);
	let endDateState = $state.raw(createContractEndDateState());
	let normalizedTenantSearch = $derived.by(() => tenantSearch.trim().toLowerCase());

	// bounded, and narrowed in SQL. This read used to ask for every tenant and keep twenty of
	// them in the browser — 543 kB in one call at the measured stress scale, on every open of
	// this form. ADR 0010 declined to license that and parked it as a form question; this is
	// the form. `placeholderData` on the hook holds the previous page while a new term is in
	// flight, so the list narrows rather than emptying between keystrokes.
	const tenantsQuery = useFetchTenants(() => ({
		enabled: open,
		search: normalizedTenantSearch || undefined,
		limit: MAX_VISIBLE_TENANTS
	}));

	const selectedTenantQuery = useFetchTenant(() => ({
		id: $form.tenantId || undefined,
		enabled: open && Boolean($form.tenantId)
	}));

	const toTenantOption = (tenant: {
		id: string;
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

	// the picker opens on the tenants rather than on an instruction to search for one: the
	// query answers an empty term with the first page by name, so there is always something to
	// choose from. Nothing is re-filtered here — the term is the query's.
	let tenantOptions = $derived.by(() =>
		(tenantsQuery.data ?? []).map((tenant) => toTenantOption(tenant))
	);

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
		() => tenantsQuery.isLoading && (tenantsQuery.data ?? []).length === 0
	);
	let endDateInputs = $derived.by(() => ({
		start: contractStartDateValue,
		interval: $form.interval,
		cycles: $form.cycles
	}));
	let calculatedEndDate = $derived.by(() => getCalculatedContractEndDate(endDateInputs));
	let calculatedEndDateValue = $derived.by(() => calculatedEndDate?.toString() ?? '');
	let manualEndDateWindow = $derived.by(() => getManualContractEndDateWindow(endDateInputs));

	$effect(() => {
		if (!open) {
			lastHydratedFormKey = undefined;
			isStartDatePickerOpen = false;
			isEndDatePickerOpen = false;
			contractStartDateValue = undefined;
			contractEndDateValue = undefined;
			endDateState = createContractEndDateState();
			return;
		}

		isTenantPickerOpen = false;
		isStartDatePickerOpen = false;
		isEndDatePickerOpen = false;
		tenantSearch = '';

		const currentFormKey = isRenewing
			? `renew:${renewsContractId}`
			: value
				? `edit:${value.id ?? 'duplicate'}`
				: 'create';

		if (lastHydratedFormKey === currentFormKey) {
			return;
		}

		// a renewal is opened on an identity alone, so there is nothing to fill the form with
		// until the contract it renews has arrived. The key is left unrecorded so this runs
		// again when it does.
		if (isRenewing && !predecessor) {
			return;
		}

		const nextFormValue =
			isRenewing && predecessor
				? toRenewalFormValue(predecessor)
				: value
					? toFormValue(value)
					: getInitialForm();
		const nextStartDateValue = parseCalendarDate(nextFormValue.start);
		const nextEndDateValue = parseCalendarDate(nextFormValue.end);
		const nextEndDateInputs = {
			start: nextStartDateValue,
			interval: nextFormValue.interval,
			cycles: nextFormValue.cycles
		};
		form.set(nextFormValue);
		contractStartDateValue = nextStartDateValue;
		contractEndDateValue = nextEndDateValue;
		endDateState = hydrateContractEndDateState({
			endDate: nextEndDateValue?.toString() ?? '',
			calculatedEndDate: getCalculatedContractEndDate(nextEndDateInputs)?.toString() ?? '',
			calculationKey: getContractEndDateCalculationKey(nextEndDateInputs)
		});
		lastHydratedFormKey = currentFormKey;
	});

	$effect(() => {
		const nextStartValue = contractStartDateValue?.toString() ?? '';

		if ($form.start !== nextStartValue) {
			$form.start = nextStartValue;
		}
	});

	$effect(() => {
		const change = observeContractEndDateInputs(
			endDateState,
			getContractEndDateCalculationKey(endDateInputs)
		);

		endDateState = change.state;

		if (change.appliesCalculatedEndDate) {
			isEndDatePickerOpen = false;
			contractEndDateValue = calculatedEndDate;
		}
	});

	$effect(() => {
		const change = observeContractEndDate(endDateState, {
			endDate: contractEndDateValue?.toString() ?? '',
			calculatedEndDate: calculatedEndDateValue,
			isPickerOpen: isEndDatePickerOpen
		});

		endDateState = change.state;

		if (change.closesPicker) {
			isEndDatePickerOpen = false;
		}
	});

	$effect(() => {
		const nextEndValue = contractEndDateValue?.toString() ?? '';

		if ($form.end !== nextEndValue) {
			$form.end = nextEndValue;
		}
	});

	$effect(() => {
		if (!isTenantPickerOpen) {
			tenantSearch = '';
		}
	});

	const superform = { form, constraints, errors, enhance, reset, ...rest };

	// one flag for the three writes this surface can be making, so the footer states it once.
	const isSaving = $derived(
		CreateMutation.isPending || UpdateMutation.isPending || RenewMutation.isPending
	);

	const totalExpectedAmount = $derived(Number($form.cost) * Number($form.cycles));
	const hasTotalExpectedAmount = $derived(
		Number.isFinite(totalExpectedAmount) && totalExpectedAmount > 0
	);
	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// a range needs both ends, and a half-set period reads as one date rather than as a range
	// missing a half — the em dash already means "nothing here" everywhere else in this panel.
	const contractPeriod = $derived(
		contractStartDateValue && contractEndDateValue
			? `${formatCalendarDate(contractStartDateValue, dateFormatter, '')} – ${formatCalendarDate(contractEndDateValue, dateFormatter, '')}`
			: '—'
	);
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="heavy"
	title={isRenewing ? $LL.contracts.form.renewTitle() : $LL.common.nav.contracts()}
	description={isRenewing ? $LL.contracts.form.renewDescription() : undefined}
>
	<div class="flex flex-col gap-4">
		<!-- what the contract will be, pinned above the fields that decide it — it is sticky
		     because the total is answered by cost and cycles, which are far enough down that a
		     read-out scrolling with them leaves exactly when it is being used. The opaque wrapper
		     is what the tinted panel is stacked on: sticky over a translucent fill shows the
		     fields sliding underneath it. The period is a range rather than "start → end"
		     because an arrow does not mirror in Arabic, where the two dates swap and it would
		     then point at the wrong one. -->
		<div class="sticky top-0 z-10 bg-card pb-1">
			<div class="grid grid-cols-2 gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
				<div class="col-span-2 flex flex-col">
					<span class="text-xs text-muted-foreground">{$LL.common.labels.tenant()}</span>
					<span class="truncate font-medium">{selectedTenant?.name ?? '—'}</span>
				</div>
				<div class="flex min-w-0 flex-col">
					<span class="truncate text-xs text-muted-foreground">
						{$LL.contracts.form.totalExpectedAmount()}
					</span>
					<span class="truncate font-medium tabular-nums">
						{hasTotalExpectedAmount ? formatMoney(totalExpectedAmount) : '—'}
					</span>
				</div>
				<div class="flex min-w-0 flex-col">
					<span class="truncate text-xs text-muted-foreground">
						{$LL.common.labels.contractPeriod()}
					</span>
					<span class="truncate text-sm tabular-nums">{contractPeriod}</span>
				</div>
			</div>
		</div>

		<!-- one column: the surface is 512px and does not widen, so a second column here would
		     be two columns inside a container narrower than one they would fit. -->
		<div class="flex flex-col gap-4">
			<Form.Field form={superform} name="tenantId" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.common.labels.tenant()}</Form.Label>
					<Popover.Root bind:open={isTenantPickerOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									disabled={isRenewing}
									class={cn(
										'w-full justify-between font-normal',
										insetControl,
										!selectedTenant && 'text-muted-foreground'
									)}
									aria-invalid={$errors.tenantId ? 'true' : undefined}
								>
									<span class="min-w-0 flex-1 truncate text-start">
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
									{#if isTenantResultsLoading && tenantOptions.length === 0}
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
													<div class="flex min-w-0 flex-1 flex-col text-start">
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
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="govId" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.common.labels.governmentIdOptional()}</Form.Label>
					<Input
						bind:value={$form.govId}
						placeholder={$LL.common.labels.governmentIdOptional()}
						class={insetControl}
						aria-invalid={$errors.govId ? 'true' : undefined}
						{...$constraints.govId}
					/>
				</Form.Control>
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="interval" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.common.labels.cycle()}</Form.Label>
					<Select.Root type="single" bind:value={$form.interval} disabled={isRenewing}>
						<Select.Trigger
							class={cn('w-full', insetControl)}
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
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="cost" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.common.labels.costPerPayment()}</Form.Label>
					<Input
						type="number"
						min="0.01"
						step="0.01"
						disabled={isRenewing}
						value={$form.cost}
						oninput={(event) => {
							$form.cost = event.currentTarget.value;
						}}
						placeholder="0.00"
						class={insetControl}
						aria-invalid={$errors.cost ? 'true' : undefined}
						{...$constraints.cost}
					/>
				</Form.Control>
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="start" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.contracts.form.startDate()}</Form.Label>
					<input type="hidden" name="start" value={$form.start} />
					<Popover.Root bind:open={isStartDatePickerOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="outline"
									class={cn(
										'w-full justify-between font-normal',
										insetControl,
										!contractStartDateValue && 'text-muted-foreground'
									)}
									aria-invalid={$errors.start ? 'true' : undefined}
								>
									<span
										>{formatCalendarDate(
											contractStartDateValue,
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
								bind:value={contractStartDateValue}
								captionLayout="dropdown"
							/>
						</Popover.Content>
					</Popover.Root>
				</Form.Control>
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="cycles" class="group relative">
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
						class={insetControl}
						aria-invalid={$errors.cycles ? 'true' : undefined}
						{...$constraints.cycles}
					/>
				</Form.Control>
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="end" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.contracts.form.calculatedEndDate()}</Form.Label>
					<input type="hidden" name="end" value={$form.end} />
					<Popover.Root bind:open={isEndDatePickerOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									type="button"
									variant="outline"
									disabled={!manualEndDateWindow?.start || !manualEndDateWindow?.end}
									class={cn(
										'w-full justify-between font-normal',
										insetControl,
										!contractEndDateValue && 'text-muted-foreground',
										endDateState.isManuallyEdited &&
											'border-permitted/40 bg-permitted/6 text-permitted'
									)}
									aria-invalid={$errors.end ? 'true' : undefined}
								>
									<span
										>{formatCalendarDate(
											contractEndDateValue,
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
								bind:value={contractEndDateValue}
								placeholder={contractEndDateValue ?? calculatedEndDate ?? contractStartDateValue}
								captionLayout="dropdown"
								minValue={manualEndDateWindow?.start}
								maxValue={manualEndDateWindow?.end}
							>
								{#snippet day({ day })}
									{@const isAllowedManualDate = manualEndDateWindow
										? isContractEndDateWithinWindow(day, manualEndDateWindow)
										: false}
									{@const isSuggestedDate = calculatedEndDate
										? day.compare(calculatedEndDate) === 0
										: false}
									<Calendar.Day
										class={cn(
											isAllowedManualDate &&
												'rounded-full border border-permitted/45 text-permitted hover:bg-permitted/10 data-[selected]:border-permitted data-[selected]:bg-permitted data-[selected]:text-permitted-foreground',
											isSuggestedDate &&
												'border-permitted bg-permitted/20 font-medium text-permitted ring-1 ring-permitted/35 data-[selected]:bg-permitted data-[selected]:text-permitted-foreground'
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
		</div>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={closeContractForm}>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={isSaving} class="capitalize">
			{#if isRenewing}
				{RenewMutation.isPending ? $LL.common.actions.renewing() : $LL.common.actions.renew()}
			{:else}
				{value?.id ? $LL.common.actions.update() : $LL.common.actions.create()}
			{/if}
		</Button>
	{/snippet}
</FormSurface>
