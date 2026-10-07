<script lang="ts">
	import type { Contract } from '$lib/platform/database/schema';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import FieldError from '@rentable/design/block/field-error.svelte';
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import * as Form from '@rentable/design/primitive/form/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { parseCalendarDate } from '$lib/date';
	import { RIYAL, toWesternDigits } from '$lib/platform/locale';
	import {
		CONTRACT_END_DATE_TOLERANCE_DAYS,
		hasValidContractPeriodForInterval
	} from '$lib/contract/schedule/cycle';
	import {
		createContractEndDateState,
		getCalculatedContractEndDate,
		getContractEndDateCalculationKey,
		getManualContractEndDateWindow,
		hydrateContractEndDateState,
		observeContractEndDate,
		observeContractEndDateInputs
	} from '$lib/contract/schedule/end-date';
	import {
		contractFormSchema,
		toFormValue,
		toInitialForm,
		toPayload,
		toRenewalFormValue,
		type ContractForm,
		type ContractFormContract
	} from '$lib/contract/form';
	import type { ContractPrefill } from '$lib/contract/host.svelte';
	import { onMutationError } from '$lib/mutation/ui';
	import { useCreateContract, useFetchContract, useUpdateContract } from '$lib/contract/query';
	import { useRenewContract } from '$lib/contract/renewal/query';
	import { fieldOfFailure, toRefusalText } from '$lib/error/refusal';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { type CalendarDate } from '@internationalized/date';
	import CalendarPlusIcon from '@lucide/svelte/icons/calendar-plus';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import { TRPCError } from '@trpc/server';
	import { surfaceForm } from '$lib/form';
	import { defaults, setError, superForm } from 'sveltekit-superforms';
	import { zod4 } from 'sveltekit-superforms/adapters';
	import UnitField from '$lib/contract/assignment/component/unit-field.svelte';
	import EndDateField from './end-date-field.svelte';
	import FormSummary from './form-summary.svelte';
	import IntervalField from './interval-field.svelte';
	import StartDateField from './start-date-field.svelte';
	import TenantField, { useTenantChoice } from './tenant-field.svelte';

	/**
	 * The contract form: creating a contract, editing or duplicating one, and renewing one. What it
	 * holds and the conversions in and out of it are `contract/form.ts`; its tenant, cycle, dates
	 * and units are fields of their own beside it, and what the form keeps is the state they share,
	 * how it opens on a contract, and what a submission writes.
	 */

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
	};

	const ContractFormSchema = contractFormSchema($LL);

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
		/** the contract being edited, or the details a duplicate starts from. */
		value?: ContractFormContract;
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

	let { form, constraints, errors, enhance, reset, ...rest } = superForm<ContractForm>(
		defaults(zod4(ContractFormSchema)),
		{
			...surfaceForm,
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
						const field = fieldOfFailure(e);

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
	let contractStartDateValue = $state<CalendarDate | undefined>(undefined);
	let contractEndDateValue = $state<CalendarDate | undefined>(undefined);
	let lastHydratedFormKey = $state<string | undefined>(undefined);
	let endDateState = $state.raw(createContractEndDateState());

	const tenantChoice = useTenantChoice({
		open: () => open,
		search: () => tenantSearch,
		tenantId: () => $form.tenantId
	});

	// only a new contract chooses its units here; an edit and a renewal never do.
	const choosesUnits = $derived(!isRenewing && !value?.id);

	let endDateInputs = $derived.by(() => ({
		start: contractStartDateValue,
		interval: $form.interval,
		// read in Western digits, as the schema reads them (effort 854, requirement 21).
		cycles: toWesternDigits($form.cycles)
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
					: toInitialForm(prefill);
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
		<FormSummary
			tenantName={tenantChoice.selected?.name}
			cost={toWesternDigits($form.cost)}
			cycles={toWesternDigits($form.cycles)}
			start={contractStartDateValue}
			end={contractEndDateValue}
		/>

		<!-- one column: the surface is 512px and does not widen, so a second column here would
		     be two columns inside a container narrower than one they would fit. -->
		<div class="flex flex-col gap-4">
			<TenantField
				{superform}
				choice={tenantChoice}
				disabled={isRenewing}
				bind:open={isTenantPickerOpen}
				bind:search={tenantSearch}
			/>

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

			<IntervalField {superform} disabled={isRenewing} />

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

			<StartDateField
				{superform}
				bind:value={contractStartDateValue}
				bind:open={isStartDatePickerOpen}
			/>

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

			<EndDateField
				{superform}
				bind:value={contractEndDateValue}
				bind:open={isEndDatePickerOpen}
				start={contractStartDateValue}
				calculated={calculatedEndDate}
				endWindow={manualEndDateWindow}
				isManuallyEdited={endDateState.isManuallyEdited}
			/>

			{#if choosesUnits}
				<UnitField
					{superform}
					{open}
					{prefill}
					bind:pickerOpen={isUnitPickerOpen}
					bind:search={unitSearch}
				/>
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
