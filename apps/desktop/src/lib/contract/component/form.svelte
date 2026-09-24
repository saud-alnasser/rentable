<script lang="ts">
	import { ContractSchema, type Contract } from '$lib/platform/database/schema';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Calendar from '@rentable/design/primitive/calendar/index.js';
	import * as Command from '@rentable/design/primitive/command/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import * as Popover from '@rentable/design/primitive/popover/index.js';
	import * as ToggleGroup from '@rentable/design/primitive/toggle-group/index.js';
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
	import type { ContractPrefill } from '$lib/contract/host.svelte';
	import { getContractRenewalTerm } from '$lib/contract/renewal';
	import { useReadUnit } from '$lib/complex/query';
	import { onMutationError } from '$lib/design/mutation';
	import {
		useCreateContract,
		useFetchAssignableUnitsForTerm,
		useFetchContract,
		useRenewContract,
		useUpdateContract
	} from '$lib/contract/query';
	import { fieldOfRefusal, readRefusal, toRefusalText } from '$lib/error/refusal';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { useFetchTenant, useFetchTenants } from '$lib/tenant/query';
	import { DateFormatter, type CalendarDate } from '@internationalized/date';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import { TRPCError } from '@trpc/server';
	import { surfaceForm } from '$lib/design/form';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import { untrack } from 'svelte';
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
		end: z.string().min(1, $LL.contracts.form.endDateRequired()),
		// the units a new contract is created holding. Only creation offers them: an edit and a
		// renewal leave the units where the tab and the predecessor put them.
		unitIds: z.array(z.string()).default([])
	});

	type ContractForm = z.infer<typeof ContractFormSchema>;

	const CreateMutation = useCreateContract();
	const UpdateMutation = useUpdateContract();
	const RenewMutation = useRenewContract();

	let {
		value,
		renewsContractId,
		prefill,
		open,
		onOpenChange,
		onCreated
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
		/** what a new contract starts with, where whoever opened the form already knows it. */
		prefill?: ContractPrefill;
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/**
		 * a new record has been written: the host lands the reader where the next step is
		 * ([[rules/interface]], *Guidance*).
		 */
		onCreated?: (created: { id: string }) => void;
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
		tenantId: prefill?.tenantId ?? '',
		interval: '1m',
		cost: '',
		cycles: '1',
		start: '',
		end: '',
		unitIds: [...(prefill?.unitIds ?? [])]
	});

	let dateFormatter = $derived(new DateFormatter(getIntlLocale($locale), { dateStyle: 'medium' }));
	const getContractPeriodValidationMessage = (interval: Contract['interval']) =>
		$LL.contracts.form.periodMustMatchWholeCycles({
			days: CONTRACT_END_DATE_TOLERANCE_DAYS,
			interval: intervalLabels[interval]()
		});
	const closeContractForm = () => {
		isTenantPickerOpen = false;
		isUnitPickerOpen = false;
		isStartDatePickerOpen = false;
		isEndDatePickerOpen = false;
		tenantSearch = '';
		unitSearch = '';
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
		end: formatDateInput(contract.end),
		unitIds: []
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
			end: formatDateInput(term.end),
			unitIds: []
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
			...surfaceForm,
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
						// one submission, one write: the contract and the units it holds.
						const created = await CreateMutation.mutateAsync({
							...payload,
							unitIds: form.data.unitIds
						});

						onCreated?.(created);
					}
					closeContractForm();
				} catch (e) {
					// an unexpected failure is the shared error handler's to report, and it already has:
					// what is left here is the refusal, mapped onto the field the reader would fix.
					if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
						// the refusal's code says which field it belongs under; a refusal shown as a
						// banner names the problem and never the field.
						const field = fieldOfRefusal(readRefusal(e)?.code);

						if (field === 'unitIds') {
							// a list's own error sits beside its items rather than on one of them.
							setError(form, 'unitIds._errors', toRefusalText(e, $LL));
						} else if (
							field === 'end' ||
							field === 'start' ||
							field === 'govId' ||
							field === 'cost' ||
							field === 'tenantId'
						) {
							setError(form, field, toRefusalText(e, $LL));
						} else {
							onMutationError({ toast: { error: true } }, e);
						}
					}
				}
			}
		}
	);

	let isTenantPickerOpen = $state(false);
	let isStartDatePickerOpen = $state(false);
	let isEndDatePickerOpen = $state(false);
	let tenantSearch = $state('');
	let isUnitPickerOpen = $state(false);
	let unitSearch = $state('');
	// what each chosen unit is called, kept as it is chosen: a search that narrows past a chosen
	// unit must not leave the field unable to name it.
	let chosenUnitNames = $state<Record<string, string>>({});
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

	// only a new contract chooses its units here; an edit and a renewal never do.
	const choosesUnits = $derived(!isRenewing && !value?.id);

	// the term the units are weighed against, in order, as the payload will state it. Absent until
	// both ends are set, because the conflict rule has nothing to read before then.
	const unitTerm = $derived.by(() => {
		if (!$form.start || !$form.end) return undefined;

		const start = parseDateInput($form.start);
		const end = parseDateInput($form.end);

		return start <= end ? { start, end } : { start: end, end: start };
	});

	// the units free over the term, narrowed in SQL by the picker's search.
	const freeUnitsQuery = useFetchAssignableUnitsForTerm(() => ({
		start: unitTerm?.start,
		end: unitTerm?.end,
		search: unitSearch,
		enabled: open && choosesUnits
	}));
	const freeUnits = $derived(freeUnitsQuery.data ?? []);

	const toUnitName = (unit: { name: string; complexName: string }) =>
		`${unit.name} · ${unit.complexName}`;

	// a unit chosen before the form opened (a unit's own page asked for the contract) is named from
	// its own read: the free units are not read until the term is set, and need not include it.
	const readUnit = useReadUnit();

	$effect(() => {
		if (!open || !choosesUnits) return;

		const prefilledUnitIds = prefill?.unitIds ?? [];

		untrack(() => {
			for (const id of prefilledUnitIds) {
				if (chosenUnitNames[id]) continue;

				readUnit(id)
					.then((unit) => {
						if (unit) chosenUnitNames[id] = toUnitName(unit);
					})
					.catch(() => {});
			}
		});
	});

	// the chosen units the term leaves out, because another contract holds them over it. Read only
	// off the whole free set for this term (no search narrowing it, nothing still arriving), since
	// a unit missing from a narrowed or a stale list says nothing about the term.
	const heldUnitIds = $derived.by(() => {
		if (!unitTerm || unitSearch.trim() || freeUnitsQuery.isFetching || !freeUnitsQuery.data) {
			return [];
		}

		const freeUnitIds = new Set(freeUnits.map((unit) => unit.id));

		return $form.unitIds.filter((id) => !freeUnitIds.has(id));
	});

	const unchooseUnit = (id: string) => {
		$form.unitIds = $form.unitIds.filter((chosen) => chosen !== id);
	};

	const toggleUnit = (unit: { id: string; name: string; complexName: string }) => {
		if ($form.unitIds.includes(unit.id)) {
			$form.unitIds = $form.unitIds.filter((id) => id !== unit.id);
		} else {
			chosenUnitNames[unit.id] = toUnitName(unit);
			$form.unitIds = [...$form.unitIds, unit.id];
		}
	};

	// the chosen units, named in the reader's list style. A unit chosen before its name was read
	// (one a caller prefilled) is named once the free units arrive.
	const chosenUnitsLabel = $derived.by(() => {
		const freeUnitNames = new Map(freeUnits.map((unit) => [unit.id, toUnitName(unit)]));
		const names = $form.unitIds.map((id) => chosenUnitNames[id] ?? freeUnitNames.get(id) ?? '…');

		return new Intl.ListFormat(getIntlLocale($locale), { type: 'conjunction' }).format(names);
	});
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
		isUnitPickerOpen = false;
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

	$effect(() => {
		if (!isUnitPickerOpen) {
			unitSearch = '';
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
					<!-- four exclusive choices, so a toggle group rather than a menu: all four are seen
					     side by side ([[rules/interface]], *Field kinds*). -->
					<ToggleGroup.Root
						type="single"
						variant="outline"
						size="sm"
						class="w-full"
						aria-label={$LL.common.labels.cycle()}
						aria-invalid={$errors.interval ? 'true' : undefined}
						disabled={isRenewing}
						value={$form.interval}
						onValueChange={(next) => {
							// pressing the one already chosen would unset a single group; a contract
							// always has a cycle.
							if (next) $form.interval = next as Contract['interval'];
						}}
					>
						{#each intervals as interval (interval.value)}
							<ToggleGroup.Item value={interval.value} class="flex-1 capitalize">
								{interval.label}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</Form.Control>
				<FieldError />
			</Form.Field>

			<Form.Field form={superform} name="cost" class="group relative">
				<Form.Control>
					<Form.Label>{$LL.common.labels.costPerPayment()}</Form.Label>
					<!-- money: the riyal sign as the adornment and the decimal keypad, left to right in
					     both locales as every amount is drawn ([[rules/interface]], *Field kinds*). -->
					<InputGroup.Root class={insetControl} dir="ltr" data-disabled={isRenewing || undefined}>
						<InputGroup.Addon>{RIYAL}</InputGroup.Addon>
						<InputGroup.Input
							inputmode="decimal"
							autocomplete="off"
							disabled={isRenewing}
							value={$form.cost}
							oninput={(event) => {
								$form.cost = event.currentTarget.value;
							}}
							placeholder="0.00"
							aria-invalid={$errors.cost ? 'true' : undefined}
							{...$constraints.cost}
						/>
					</InputGroup.Root>
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
								locale={getIntlLocale($locale)}
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
								locale={getIntlLocale($locale)}
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

			{#if choosesUnits}
				<!-- other records, so a combobox over their search ([[rules/interface]], *Field
				     kinds*), choosing several: it stays open while the reader picks. It follows the
				     term because what it offers is decided by the term. -->
				<Form.Field form={superform} name="unitIds" class="group relative">
					<Form.Control>
						<Form.Label>{$LL.contracts.form.unitsOptional()}</Form.Label>
						<Popover.Root bind:open={isUnitPickerOpen}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										type="button"
										variant="outline"
										disabled={!unitTerm}
										class={cn(
											'w-full justify-between font-normal',
											insetControl,
											$form.unitIds.length === 0 && 'text-muted-foreground'
										)}
										aria-invalid={$errors.unitIds?._errors ? 'true' : undefined}
									>
										<span class="min-w-0 flex-1 truncate text-start">
											{$form.unitIds.length > 0
												? chosenUnitsLabel
												: $LL.contracts.form.chooseUnits()}
										</span>
										<ChevronDownIcon class="size-4 shrink-0 opacity-50" />
									</Button>
								{/snippet}
							</Popover.Trigger>

							<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
								<Command.Root class="w-full" shouldFilter={false}>
									<Command.Input
										bind:value={unitSearch}
										placeholder={$LL.contracts.form.searchUnitPlaceholder()}
									/>
									<Command.List>
										<!-- a chosen unit the term leaves out stays in the list, checked and saying
										     why, so the reader can take it back out; the free ones follow. -->
										{#if heldUnitIds.length > 0}
											<Command.Group>
												{#each heldUnitIds as id (id)}
													<Command.Item value={id} onSelect={() => unchooseUnit(id)}>
														<div class="flex min-w-0 flex-1 flex-col text-start">
															<span class="truncate">{chosenUnitNames[id] ?? '…'}</span>
															<span class="truncate text-xs text-muted-foreground">
																{$LL.contracts.form.unitHeldOverTerm()}
															</span>
														</div>
														<CheckIcon class="ms-auto size-4" />
													</Command.Item>
												{/each}
											</Command.Group>
										{/if}
										{#if freeUnitsQuery.isLoading && freeUnits.length === 0}
											<div class="p-3 text-sm text-muted-foreground">
												{$LL.contracts.form.loadingUnits()}
											</div>
										{:else if freeUnits.length === 0}
											<div class="p-3 text-sm text-muted-foreground">
												{$LL.contracts.form.noUnitFree()}
											</div>
										{:else}
											<Command.Group>
												{#each freeUnits as unit (unit.id)}
													<Command.Item value={unit.id} onSelect={() => toggleUnit(unit)}>
														<div class="flex min-w-0 flex-1 flex-col text-start">
															<span class="truncate">{unit.name}</span>
															<span class="truncate text-xs text-muted-foreground">
																{unit.complexName}
															</span>
														</div>
														<CheckIcon
															class={cn(
																'ms-auto size-4',
																$form.unitIds.includes(unit.id) ? 'opacity-100' : 'opacity-0'
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
					<Form.Description>
						{#if heldUnitIds.length > 0}
							{$LL.common.refusals.contract.unitsTaken()}
						{:else}
							{unitTerm ? $LL.contracts.form.unitsHint() : $LL.contracts.form.unitsNeedTerm()}
						{/if}
					</Form.Description>
					<FieldError />
				</Form.Field>
			{/if}
		</div>
	</div>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isSaving} onclick={closeContractForm}>
			{$LL.common.actions.cancel()}
		</Button>
		<!-- the verb's glyph before its label, as every submit carries one; renew takes the glyph
		     its act carries in `contract/acts.ts`. -->
		<Button type="submit" disabled={isSaving} class="capitalize">
			{#if isRenewing}
				<CalendarPlusIcon class="size-4" />
				{RenewMutation.isPending ? $LL.common.actions.renewing() : $LL.common.actions.renew()}
			{:else if value?.id}
				<SaveIcon class="size-4" />
				{$LL.common.actions.update()}
			{:else}
				<PlusIcon class="size-4" />
				{$LL.common.actions.create()}
			{/if}
		</Button>
	{/snippet}
</FormSurface>
