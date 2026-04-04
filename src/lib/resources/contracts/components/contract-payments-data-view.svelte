<script lang="ts">
	import type { Payment } from '$lib/api/database/schema';
	import { hasSatisfiedContractPaymentRequirement } from '$lib/api/utils/contract-status';
	import DataTableActionsDropdown from '$lib/common/components/blocks/data-table-actions-dropdown.svelte';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import DeleteDialog from '$lib/common/components/blocks/delete-dialog.svelte';
	import {
		Card,
		CardAction,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/common/components/fragments/card';
	import { Progress } from '$lib/common/components/fragments/progress';
	import { Skeleton } from '$lib/common/components/fragments/skeleton';
	import {
		formatLocaleDate,
		formatLocaleNumber,
		formatLocaleRangeWithUnit,
		formatLocaleValueWithUnit
	} from '$lib/common/utils/locale';
	import { cn } from '$lib/common/utils/tailwind';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		useDeletePayment,
		useFetchContract,
		useInfiniteContractPayments
	} from '$lib/resources/contracts/hooks/queries';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import PaymentForm from './payment-form.svelte';

	const paymentsVirtualThreshold = 3;
	const paymentsVirtualViewportHeight = 'min(56vh, 34rem)';

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

	const formatCurrency = (value: number) => formatLocaleNumber($locale, value);
	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
	const formatMoneyRange = (start: number, end: number) =>
		formatLocaleRangeWithUnit($locale, start, end, $LL.common.messages.sar());

	let { contractId }: { contractId: number } = $props();
	let search = $state('');

	const contractQuery = useFetchContract(() => contractId);
	const paymentsQuery = useInfiniteContractPayments(() => ({ contractId, search }));
	const deleteMutation = useDeletePayment();

	let payment = $state<Payment | undefined>(undefined);
	let isPaymentFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	const getContractLabel = () => contractQuery.data?.govId?.trim() || undefined;
	const getPaymentsTitle = () =>
		getContractLabel()
			? $LL.contracts.payments.titleFor({ govId: getContractLabel()! })
			: $LL.contracts.payments.title();

	let isTerminated = $derived(contractQuery.data?.status === 'terminated');
	let hasSatisfiedRequiredAmount = $derived.by(() => {
		if (!contractQuery.data) return false;

		return hasSatisfiedContractPaymentRequirement(
			contractQuery.data.paidAmount,
			contractQuery.data.expectedAmount
		);
	});
	let isAddLocked = $derived(isTerminated || hasSatisfiedRequiredAmount);
	let isDeleteLocked = $derived(isTerminated);
	let showLockNotice = $derived(isTerminated || hasSatisfiedRequiredAmount);
	let paymentProgress = $derived.by(() => {
		const paidAmount = contractQuery.data?.paidAmount ?? 0;
		const expectedAmount = contractQuery.data?.expectedAmount ?? 0;
		const progressValue = expectedAmount > 0 ? Math.min(paidAmount, expectedAmount) : 0;
		const progressPercent =
			expectedAmount > 0 ? Math.min((paidAmount / expectedAmount) * 100, 100) : 0;
		const remainingAmount = Math.max(expectedAmount - paidAmount, 0);

		return { paidAmount, expectedAmount, progressValue, progressPercent, remainingAmount };
	});

	const getLockSummary = () =>
		isTerminated
			? $LL.contracts.payments.terminatedSummary()
			: hasSatisfiedRequiredAmount
				? $LL.contracts.payments.fullyPaidSummary()
				: $LL.contracts.payments.trackSummary();
	const getLockNotice = () =>
		isTerminated
			? $LL.contracts.payments.terminatedNotice()
			: hasSatisfiedRequiredAmount
				? $LL.contracts.payments.fullyPaidNotice()
				: undefined;
	const getSearchValue = (record: Payment) =>
		[String(record.amount), formatDate(record.date)].join(' ');
	let payments = $derived.by(
		() => paymentsQuery.data?.pages.flatMap((page: { items: Payment[] }) => page.items) ?? []
	);
	let shouldConstrainLayout = $derived(payments.length >= paymentsVirtualThreshold);
</script>

<div class={cn('flex flex-col gap-4', shouldConstrainLayout && 'min-h-0 flex-1')}>
	{#if contractQuery.isLoading}
		<div class="space-y-3">
			<Skeleton class="h-8 w-48" />
			<Skeleton class="h-4 w-72" />
			<Skeleton class="h-24 w-full rounded-md" />
		</div>
	{:else}
		<div class="space-y-1">
			<h1 class="text-2xl font-bold">{getPaymentsTitle()}</h1>
			<p class="text-sm text-muted-foreground">{getLockSummary()}</p>
		</div>
	{/if}

	{#if contractQuery.data}
		<div
			class="rounded-[1.25rem] border border-border/70 bg-background/60 p-4 shadow-lg backdrop-blur-lg"
		>
			<div class="mb-2 flex items-center justify-between gap-3 text-sm rtl:flex-row-reverse">
				<span class="font-medium">{$LL.common.labels.paymentFulfillment()}</span>
				<span class="text-muted-foreground">
					{formatMoneyRange(paymentProgress.paidAmount, paymentProgress.expectedAmount)}
				</span>
			</div>
			<Progress
				value={paymentProgress.progressValue}
				max={Math.max(paymentProgress.expectedAmount, 1)}
				class="h-3 bg-emerald-500/15 **:data-[slot=progress-indicator]:bg-emerald-600"
			/>
			<div
				class="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground rtl:flex-row-reverse"
			>
				<span
					>{$LL.contracts.payments.percentFulfilled({
						percent: String(Math.round(paymentProgress.progressPercent))
					})}</span
				>
				<span
					>{$LL.contracts.payments.remaining({
						amount: formatCurrency(paymentProgress.remainingAmount)
					})}</span
				>
			</div>
		</div>
	{/if}

	{#if showLockNotice}
		<p
			class="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground backdrop-blur-sm"
		>
			{getLockNotice()}
		</p>
	{/if}

	<DataView
		data={payments}
		isLoading={paymentsQuery.isLoading}
		isFetching={paymentsQuery.isFetching}
		hasNextPage={paymentsQuery.hasNextPage}
		isFetchingNextPage={paymentsQuery.isFetchingNextPage}
		fetchNextPage={() => paymentsQuery.fetchNextPage()}
		bind:searchValue={search}
		{getSearchValue}
		virtualItemHeight={220}
		virtualThreshold={paymentsVirtualThreshold}
		virtualViewportHeight={paymentsVirtualViewportHeight}
		onCreate={isAddLocked
			? undefined
			: () => {
					payment = undefined;
					isPaymentFormOpen = true;
				}}
	>
		{#snippet item(record: Payment)}
			<Card class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl">
				<CardHeader class="gap-3 border-b pb-4">
					<div class="space-y-1 text-start">
						<CardTitle>{formatMoney(record.amount)}</CardTitle>
						<CardDescription>{formatDate(record.date)}</CardDescription>
					</div>
					{#if !isDeleteLocked}
						<CardAction>
							<DataTableActionsDropdown
								menuLabel={null}
								actions={[
									{
										label: $LL.common.actions.edit(),
										icon: SquarePenIcon,
										onclick: () => {
											payment = record;
											isPaymentFormOpen = true;
										}
									},
									{ type: 'separator' as const },
									{
										label: $LL.common.actions.delete(),
										icon: Trash2Icon,
										variant: 'destructive' as const,
										onclick: () => {
											payment = record;
											isDeleteDialogOpen = true;
										}
									}
								]}
							/>
						</CardAction>
					{/if}
				</CardHeader>
				<CardContent class="grid gap-3 pt-4 sm:grid-cols-2 [&>*]:text-start">
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.amount()}
						</p>
						<p class="mt-2 text-sm font-medium">
							{formatMoney(record.amount)}
						</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.paymentDate()}
						</p>
						<p class="mt-2 text-sm font-medium">{formatDate(record.date)}</p>
					</div>
				</CardContent>
			</Card>
		{/snippet}
	</DataView>
</div>

<PaymentForm
	{contractId}
	value={payment}
	open={isPaymentFormOpen}
	onOpenChange={(isOpen) => {
		isPaymentFormOpen = isOpen;
		if (!isOpen) payment = undefined;
	}}
/>

<DeleteDialog
	open={isDeleteDialogOpen}
	onOpenChange={(isOpen) => {
		isDeleteDialogOpen = isOpen;
		if (!isOpen) payment = undefined;
	}}
	onSubmit={async () => {
		if (payment) {
			await deleteMutation.mutateAsync(payment.id);
		}
	}}
/>
