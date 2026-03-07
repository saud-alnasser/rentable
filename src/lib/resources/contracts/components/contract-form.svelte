<script lang="ts">
	import { ContractSchema, type Contract } from '$lib/api/database/schema';
	import { Button } from '$lib/common/components/fragments/button';
	import * as Command from '$lib/common/components/fragments/command';
	import * as Dialog from '$lib/common/components/fragments/dialog';
	import * as Form from '$lib/common/components/fragments/form';
	import { Input } from '$lib/common/components/fragments/input';
	import { Label } from '$lib/common/components/fragments/label';
	import * as Popover from '$lib/common/components/fragments/popover';
	import {
		RangeCalendar,
		Day as RangeCalendarDay
	} from '$lib/common/components/fragments/range-calendar';
	import * as Select from '$lib/common/components/fragments/select';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { useCreateContract, useUpdateContract } from '$lib/resources/contracts/hooks/queries';
	import { useFetchTenant, useFetchTenants } from '$lib/resources/tenants/hooks/queries';
	import {
		DateFormatter,
		getLocalTimeZone,
		isSameDay,
		parseDate,
		type CalendarDate,
		type DateValue
	} from '@internationalized/date';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { TRPCError } from '@trpc/server';
	import type { DateRange } from 'bits-ui';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import z from 'zod';

	const intervals = [
		{ value: '1m', label: 'monthly' },
		{ value: '3m', label: 'quarterly' },
		{ value: '6m', label: 'semi-annual' },
		{ value: '12m', label: 'annual' }
	] as const;

	const intervalLabels: Record<Contract['interval'], string> = {
		'1m': 'monthly',
		'3m': 'quarterly',
		'6m': 'semi-annual',
		'12m': 'annual'
	};

	const MAX_VISIBLE_TENANTS = 20;

	const ContractFormSchema = z.object({
		id: z.number().optional(),
		govId: z.string().trim().optional().default(''),
		tenantId: z.string().min(1, 'tenant is required'),
		interval: ContractSchema.shape.interval,
		cost: z
			.string()
			.trim()
			.min(1, 'cost is required')
			.refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
				message: 'cost must be greater than zero'
			}),
		start: z.string().min(1, 'start date is required'),
		end: z.string().min(1, 'end date is required')
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
		start: '',
		end: ''
	});

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
	const formatDateRange = (value: DateRange | undefined) => {
		if (!value?.start && !value?.end) return 'pick a date range';
		if (value.start && !value.end)
			return `${formatCalendarDate(value.start as CalendarDate)} - end date`;
		if (!value.start || !value.end) return 'pick a date range';

		return `${formatCalendarDate(value.start as CalendarDate)} - ${formatCalendarDate(value.end as CalendarDate)}`;
	};

	type SelectedRangeBoundary = 'start' | 'end';

	const toFormValue = (contract: Contract): ContractForm => ({
		id: contract.id,
		govId: contract.govId ?? '',
		tenantId: contract.tenantId.toString(),
		interval: contract.interval,
		cost: contract.cost.toString(),
		start: formatDateInput(contract.start),
		end: formatDateInput(contract.end)
	});

	const normalizeDateRange = (value: DateRange | undefined): DateRange | undefined => {
		if (!value?.start || !value?.end) return value;

		if (value.start.compare(value.end) <= 0) {
			return value;
		}

		return {
			start: value.end,
			end: value.start
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
							setError(form, 'govId', 'government id is associated with another contract');
						} else if (e.message.includes('end date')) {
							setError(form, 'end', 'end date must be after start date');
						} else if (e.message.includes('payment cycle')) {
							setError(form, 'end', e.message);
						} else if (e.message.includes('cost')) {
							setError(form, 'cost', 'cost per payment must be greater than zero');
						} else if (e.message.includes('tenant')) {
							setError(form, 'tenantId', 'please select a valid tenant');
						} else {
							toast.error(e.message);
						}
					} else {
						toast.error('unexpected error occurred!');
					}
				}
			}
		}
	);

	let isTenantPickerOpen = $state(false);
	let tenantSearch = $state('');
	let dateRangeValue = $state<DateRange | undefined>(undefined);
	let dateRangePlaceholder = $state<DateValue | undefined>(undefined);
	let selectedRangeBoundary = $state<SelectedRangeBoundary | undefined>(undefined);
	let dateRangePlaceholderSyncToken = $state(0);
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

	const clearRangeSelection = () => {
		selectedRangeBoundary = undefined;
	};

	const syncDateRangePlaceholder = async (nextPlaceholder: DateValue | undefined) => {
		const syncToken = ++dateRangePlaceholderSyncToken;
		await tick();

		if (syncToken !== dateRangePlaceholderSyncToken) {
			return;
		}

		if (!nextPlaceholder) {
			dateRangePlaceholder = undefined;
			return;
		}

		if (!dateRangePlaceholder || !isSameDay(dateRangePlaceholder, nextPlaceholder)) {
			dateRangePlaceholder = nextPlaceholder;
		}
	};

	const setDateRangeValue = (value: DateRange | undefined, latestSetEdge?: DateValue) => {
		const normalizedValue = normalizeDateRange(value);
		const nextPlaceholder = latestSetEdge ?? normalizedValue?.end ?? normalizedValue?.start;
		dateRangeValue = normalizedValue;
		dateRangePlaceholder = nextPlaceholder;
		void syncDateRangePlaceholder(nextPlaceholder);
	};

	const applyNoRangeRule = (day: DateValue) => {
		const currentStart = dateRangeValue?.start;

		if (!currentStart || dateRangeValue?.end) {
			setDateRangeValue({ start: day, end: undefined }, day);
			return;
		}

		if (day.compare(currentStart) < 0) {
			setDateRangeValue({ start: day, end: currentStart }, day);
			return;
		}

		setDateRangeValue({ start: currentStart, end: day }, day);
	};

	const moveSelectedRangeBoundary = (boundary: SelectedRangeBoundary, day: DateValue) => {
		const currentStart = dateRangeValue?.start;
		const currentEnd = dateRangeValue?.end;

		if (!currentStart || !currentEnd) {
			clearRangeSelection();
			applyNoRangeRule(day);
			return;
		}

		if (boundary === 'start') {
			if (currentEnd.compare(day) < 0) {
				setDateRangeValue({ start: currentEnd, end: day }, day);
			} else {
				setDateRangeValue({ start: day, end: currentEnd }, day);
			}
		} else if (day.compare(currentStart) < 0) {
			setDateRangeValue({ start: day, end: currentStart }, day);
		} else {
			setDateRangeValue({ start: currentStart, end: day }, day);
		}

		clearRangeSelection();
	};

	const isSelectedBoundaryDay = (boundary: SelectedRangeBoundary, day: DateValue) => {
		const boundaryValue = boundary === 'start' ? dateRangeValue?.start : dateRangeValue?.end;
		return boundaryValue ? isSameDay(boundaryValue, day) : false;
	};

	const handleContractPeriodDayClick = (event: MouseEvent, day: DateValue) => {
		event.preventDefault();

		const currentStart = dateRangeValue?.start;
		const currentEnd = dateRangeValue?.end;
		const clickedStart = currentStart ? isSameDay(currentStart, day) : false;
		const clickedEnd = currentEnd ? isSameDay(currentEnd, day) : false;

		if (!currentStart) {
			clearRangeSelection();
			setDateRangeValue({ start: day, end: undefined }, day);
			return;
		}

		if (!currentEnd) {
			clearRangeSelection();
			applyNoRangeRule(day);
			return;
		}

		if (selectedRangeBoundary) {
			moveSelectedRangeBoundary(selectedRangeBoundary, day);
			return;
		}

		if (clickedStart) {
			selectedRangeBoundary = 'start';
			return;
		}

		if (clickedEnd) {
			selectedRangeBoundary = 'end';
			return;
		}

		clearRangeSelection();
		setDateRangeValue({ start: day, end: undefined }, day);
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
		const nextStart = parseCalendarDate(nextFormValue.start);
		const nextEnd = parseCalendarDate(nextFormValue.end);
		setDateRangeValue(
			{
				start: nextStart,
				end: nextEnd
			},
			nextEnd ?? nextStart
		);
		clearRangeSelection();
		form.set(nextFormValue);
		lastHydratedFormKey = currentFormKey;
	});

	$effect(() => {
		$form.start = dateRangeValue?.start?.toString() ?? '';
		$form.end = dateRangeValue?.end?.toString() ?? '';
	});

	$effect(() => {
		if (!dateRangeValue?.start || !dateRangeValue?.end) {
			clearRangeSelection();
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
	<Dialog.Content class="w-full max-w-xl">
		<form method="POST" use:enhance class="grid gap-4 md:grid-cols-2">
			<Form.Field form={superform} name="govId">
				<Form.Control>
					<Label>Government ID (optional)</Label>
					<Input
						bind:value={$form.govId}
						placeholder="Government ID (optional)"
						aria-invalid={$errors.govId ? 'true' : undefined}
						{...$constraints.govId}
					/>
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={superform} name="tenantId">
				<Form.Control>
					<Label>Tenant</Label>
					<Popover.Root bind:open={isTenantPickerOpen}>
						<Popover.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="outline"
									class={cn(
										'w-full justify-between font-normal',
										!selectedTenant && 'text-muted-foreground'
									)}
									aria-invalid={$errors.tenantId ? 'true' : undefined}
								>
									<span class="min-w-0 flex-1 truncate text-left">
										{selectedTenant?.name ||
											(selectedTenantQuery.isLoading
												? 'loading tenant...'
												: 'search and select tenant')}
									</span>
									<ChevronDownIcon class="size-4 shrink-0 opacity-50" />
								</Button>
							{/snippet}
						</Popover.Trigger>

						<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
							<Command.Root class="w-full" shouldFilter={false}>
								<Command.Input
									bind:value={tenantSearch}
									placeholder="search tenant by name, id or phone..."
								/>
								<Command.List>
									{#if !hasTenantSearch}
										<div class="p-3 text-sm text-muted-foreground">
											Start typing to search tenants by name, ID, or phone.
										</div>
									{:else if isTenantResultsLoading && tenantOptions.length === 0}
										<div class="p-3 text-sm text-muted-foreground">Loading tenants...</div>
									{:else if tenantOptions.length === 0}
										<div class="p-3 text-sm text-muted-foreground">No tenant found.</div>
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
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={superform} name="interval">
				<Form.Control>
					<Label>Payment cycle</Label>
					<Select.Root type="single" bind:value={$form.interval}>
						<Select.Trigger class="w-full" aria-invalid={$errors.interval ? 'true' : undefined}>
							{intervalLabels[$form.interval]}
						</Select.Trigger>
						<Select.Content>
							{#each intervals as interval (interval.value)}
								<Select.Item value={interval.value} label={interval.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Form.Control>
				<Form.Description />
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field form={superform} name="cost">
				<Form.Control>
					<Label>Cost per payment</Label>
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
				<Form.FieldErrors />
			</Form.Field>

			<div class="md:col-span-2">
				<Form.Field form={superform} name="start">
					<Form.Control>
						<Label>Contract period</Label>
						<input type="hidden" name="start" value={$form.start} />
						<input type="hidden" name="end" value={$form.end} />
						<Popover.Root>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										type="button"
										variant="outline"
										class={cn(
											'w-full justify-between font-normal',
											!dateRangeValue?.start && !dateRangeValue?.end && 'text-muted-foreground'
										)}
										aria-invalid={$errors.start || $errors.end ? 'true' : undefined}
									>
										<span class="truncate text-left">{formatDateRange(dateRangeValue)}</span>
										<ChevronDownIcon class="size-4 opacity-50" />
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content
								class="w-auto p-0"
								side="bottom"
								align="start"
								avoidCollisions={false}
							>
								<RangeCalendar
									value={dateRangeValue}
									bind:placeholder={dateRangePlaceholder}
									captionLayout="dropdown"
								>
									{#snippet day({ day, outsideMonth })}
										<RangeCalendarDay
											onclick={(event) => handleContractPeriodDayClick(event, day)}
											class={cn(
												selectedRangeBoundary &&
													isSelectedBoundaryDay(selectedRangeBoundary, day) &&
													'ring-2 ring-ring ring-offset-2 ring-offset-background',
												outsideMonth && 'opacity-60'
											)}
										/>
									{/snippet}
								</RangeCalendar>
							</Popover.Content>
						</Popover.Root>
					</Form.Control>
					<Form.Description />
					<Form.FieldErrors />
				</Form.Field>

				{#if $errors.end}
					<Form.Field form={superform} name="end">
						<Form.FieldErrors />
					</Form.Field>
				{/if}
			</div>

			<Button
				type="submit"
				disabled={CreateMutation.isPending || UpdateMutation.isPending}
				class="capitalize md:col-span-2"
			>
				{value?.id ? 'update' : 'create'}
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
