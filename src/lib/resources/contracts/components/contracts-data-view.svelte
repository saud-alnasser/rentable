<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Contract } from '$lib/api/database/schema';
	import api from '$lib/api/mod';
	import DataView from '$lib/common/components/blocks/data-view.svelte';
	import { Badge } from '$lib/common/components/fragments/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/common/components/fragments/card';
	import { Progress } from '$lib/common/components/fragments/progress';
	import * as Tooltip from '$lib/common/components/fragments/tooltip';
	import {
		formatLocaleDate,
		formatLocaleNumber,
		formatLocaleRangeWithUnit,
		formatLocaleValueWithUnit
	} from '$lib/common/utils/locale';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { useInfiniteContracts } from '$lib/resources/contracts/hooks/queries';
	import ContractForm from './contract-form.svelte';

	type ContractRow = Awaited<ReturnType<typeof api.contract.getPaginated>>['items'][number];

	const intervalLabels: Record<Contract['interval'], () => string> = {
		'1m': $LL.contracts.intervals.monthly,
		'3m': $LL.contracts.intervals.quarterly,
		'6m': $LL.contracts.intervals.semiAnnual,
		'12m': $LL.contracts.intervals.annual
	};

	const statusVariants: Record<
		Contract['status'],
		'default' | 'secondary' | 'destructive' | 'outline'
	> = {
		scheduled: 'secondary',
		active: 'default',
		terminated: 'destructive',
		fulfilled: 'outline',
		expired: 'secondary',
		defaulted: 'destructive'
	};

	const statusDescriptions: Record<Contract['status'], () => string> = {
		scheduled: $LL.contracts.statusDescriptions.scheduled,
		active: $LL.contracts.statusDescriptions.active,
		terminated: $LL.contracts.statusDescriptions.terminated,
		fulfilled: $LL.contracts.statusDescriptions.fulfilled,
		expired: $LL.contracts.statusDescriptions.expired,
		defaulted: $LL.contracts.statusDescriptions.defaulted
	};

	const formatDate = (value: number) =>
		formatLocaleDate($locale, value, { dateStyle: 'medium', timeZone: 'UTC' });

	const formatCurrency = (value: number) => formatLocaleNumber($locale, value);
	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());
	const formatMoneyRange = (start: number, end: number) =>
		formatLocaleRangeWithUnit($locale, start, end, $LL.common.messages.sar());

	const getTenantLabel = (record: ContractRow) =>
		record.tenantName ?? $LL.contracts.table.tenantFallback({ tenantId: String(record.tenantId) });

	const getDisplayGovId = (record: ContractRow) => record.govId?.trim() || '';
	const getDisplayTenantPhone = (record: ContractRow) => record.tenantPhone?.trim() || '';

	const getContractTitle = (record: ContractRow) => getTenantLabel(record);

	const getPaymentProgress = (record: ContractRow) => {
		const paidAmount = record.paidAmount ?? 0;
		const expectedAmount = record.expectedAmount ?? 0;
		const progressValue = expectedAmount > 0 ? Math.min(paidAmount, expectedAmount) : 0;
		const progressPercent =
			expectedAmount > 0 ? Math.min((paidAmount / expectedAmount) * 100, 100) : 0;
		const remainingAmount = Math.max(expectedAmount - paidAmount, 0);

		return { paidAmount, expectedAmount, progressValue, progressPercent, remainingAmount };
	};

	let search = $state('');

	const fetchQuery = useInfiniteContracts(() => search);

	let isContractFormOpen = $state(false);
	let contractFormRenderKey = $state(0);

	const openCreateContractForm = () => {
		contractFormRenderKey += 1;
		isContractFormOpen = true;
	};

	const getSearchValue = (record: ContractRow) =>
		[
			record.govId,
			record.tenantName,
			record.tenantPhone,
			String(record.tenantId),
			record.status,
			record.interval,
			String(record.cost)
		]
			.filter(Boolean)
			.join(' ');
	let contracts = $derived.by(
		() => fetchQuery.data?.pages.flatMap((page: { items: ContractRow[] }) => page.items) ?? []
	);
</script>

<DataView
	data={contracts}
	isLoading={fetchQuery.isLoading}
	isFetching={fetchQuery.isFetching}
	hasNextPage={fetchQuery.hasNextPage}
	isFetchingNextPage={fetchQuery.isFetchingNextPage}
	fetchNextPage={() => fetchQuery.fetchNextPage()}
	bind:searchValue={search}
	{getSearchValue}
	virtualItemHeight={420}
	onCreate={openCreateContractForm}
>
	{#snippet item(record: ContractRow)}
		{@const paymentProgress = getPaymentProgress(record)}
		<a href={resolve(`/contracts/${record.id}`)} class="block">
			<Card
				class="gap-0 overflow-hidden border-border/70 bg-card/65 shadow-xl backdrop-blur-xl transition-transform duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:bg-card/78"
			>
				<CardHeader class="gap-4 border-b pb-4">
					<div class="min-w-0 space-y-2 text-start">
						<CardTitle class="truncate">{getContractTitle(record)}</CardTitle>
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<span {...props} class="inline-flex">
										<Badge variant={statusVariants[record.status]} class="capitalize">
											{$LL.common.status[record.status]()}
										</Badge>
									</span>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content class="max-w-60" side="top">
								{statusDescriptions[record.status]()}
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				</CardHeader>
				<CardContent class="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-2 [&>*]:text-start">
					<div
						class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm sm:col-span-2 xl:col-span-2"
					>
						<div class="flex items-center justify-between gap-3 text-sm rtl:flex-row-reverse">
							<div class="text-start">
								<p class="text-xs tracking-wide text-muted-foreground uppercase">
									{$LL.common.labels.paymentFulfillment()}
								</p>
								<p class="mt-1 font-medium">
									{formatMoneyRange(paymentProgress.paidAmount, paymentProgress.expectedAmount)}
								</p>
							</div>
							<p class="text-xs text-muted-foreground">
								{$LL.contracts.payments.percentFulfilled({
									percent: String(Math.round(paymentProgress.progressPercent))
								})}
							</p>
						</div>
						<Progress
							value={paymentProgress.progressValue}
							max={Math.max(paymentProgress.expectedAmount, 1)}
							class="mt-3 h-2.5 bg-emerald-500/15 **:data-[slot=progress-indicator]:bg-emerald-600"
						/>
						<p class="mt-2 text-xs text-muted-foreground">
							{$LL.contracts.payments.remaining({
								amount: formatCurrency(paymentProgress.remainingAmount)
							})}
						</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.governmentId()}
						</p>
						<p class="mt-2 text-sm font-medium">
							{getDisplayGovId(record) || $LL.common.messages.unknown()}
						</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.phone()}
						</p>
						<p class="mt-2 text-sm font-medium" dir={localesMetadata[$locale].direction}>
							{getDisplayTenantPhone(record) || $LL.common.messages.unknown()}
						</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.cycle()}
						</p>
						<p class="mt-2 text-sm font-medium">{intervalLabels[record.interval]()}</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.payment()}
						</p>
						<p class="mt-2 text-sm font-medium">
							{formatMoney(record.cost)}
						</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.start()}
						</p>
						<p class="mt-2 text-sm font-medium">{formatDate(record.start)}</p>
					</div>
					<div class="rounded-xl border border-border/60 bg-accent/30 p-4 backdrop-blur-sm">
						<p class="text-xs tracking-wide text-muted-foreground uppercase">
							{$LL.common.labels.end()}
						</p>
						<p class="mt-2 text-sm font-medium">{formatDate(record.end)}</p>
					</div>
				</CardContent>
			</Card>
		</a>
	{/snippet}
</DataView>

{#key contractFormRenderKey}
	<ContractForm
		open={isContractFormOpen}
		onOpenChange={(isOpen) => {
			if (!isOpen) {
				contractFormRenderKey += 1;
			}

			isContractFormOpen = isOpen;
		}}
		value={undefined}
	/>
{/key}
