<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/design/primitive/card';
	import { Spinner } from '$lib/design/primitive/spinner';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { useDeletePayment, useFetchPayment } from '$lib/payment/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleValueWithUnit } from '$lib/platform/locale';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import PaymentForm from './form.svelte';

	let { paymentId }: { paymentId: number } = $props();

	const paymentQuery = useFetchPayment(() => paymentId);
	const deleteMutation = useDeletePayment();

	type PaymentFormValue = Omit<NonNullable<typeof paymentQuery.data>, 'id'> & { id?: number };

	let formOpensOn = $state<PaymentFormValue | undefined>(undefined);
	let isPaymentFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	// a terminated contract is read-only, and the refusal is the procedure's — this only
	// decides whether the surface offers the action.
	const isTerminated = $derived(paymentQuery.data?.contractStatus === 'terminated');

	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());

	async function deletePayment() {
		const payment = paymentQuery.data;
		if (!payment) return;

		await deleteMutation.mutateAsync(payment.id);
		await goto(resolve(`/contracts/${payment.contractId}`));
	}
</script>

{#if paymentQuery.isLoading}
	<div class="flex min-h-full flex-1 items-center justify-center p-6">
		<div class="flex flex-col items-center gap-3">
			<Spinner class="size-8 text-muted-foreground" />
			<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
		</div>
	</div>
{:else if !paymentQuery.data}
	<Card>
		<CardHeader>
			<CardTitle>{$LL.common.messages.noResults()}</CardTitle>
		</CardHeader>
	</Card>
{:else}
	{@const payment = paymentQuery.data}
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div class="rounded-2xl border bg-muted p-4">
			<div class="flex items-start justify-between gap-3 rtl:flex-row-reverse">
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								href={resolve(`/contracts/${payment.contractId}`)}
								variant="outline"
								size="icon-sm"
								aria-label={$LL.common.ui.previous()}
								class="shrink-0 rounded-full bg-secondary"
							>
								<ArrowLeftIcon class="size-4 rtl:rotate-180" />
								<span class="sr-only">{$LL.common.ui.previous()}</span>
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" sideOffset={8}>{$LL.common.ui.previous()}</Tooltip.Content>
				</Tooltip.Root>

				<div class="flex flex-wrap items-center justify-end gap-2">
					<!-- copying is a read, so it stands outside the lock that closes what writes. -->
					<RecordActions
						details={[
							{ label: $LL.common.labels.amount(), value: formatMoney(payment.amount) },
							{ label: $LL.common.labels.tenant(), value: payment.tenantName ?? '' },
							{
								label: $LL.common.labels.contractNumber(),
								value: payment.contractGovId ?? ''
							}
						]}
						onDuplicate={isTerminated
							? undefined
							: () => {
									formOpensOn = { ...payment, id: undefined };
									isPaymentFormOpen = true;
								}}
					/>
				</div>

				{#if !isTerminated}
					<div class="flex flex-wrap items-center justify-end gap-2">
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="outline"
										size="icon-sm"
										aria-label={$LL.common.actions.edit()}
										class="rounded-full bg-secondary"
										onclick={() => {
											formOpensOn = payment;
											isPaymentFormOpen = true;
										}}
									>
										<SquarePenIcon class="size-4" />
										<span class="sr-only">{$LL.common.actions.edit()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}
								>{$LL.common.actions.edit()}</Tooltip.Content
							>
						</Tooltip.Root>

						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										variant="destructive"
										size="icon-sm"
										aria-label={$LL.common.actions.delete()}
										class="rounded-full"
										onclick={() => (isDeleteDialogOpen = true)}
									>
										<Trash2Icon class="size-4" />
										<span class="sr-only">{$LL.common.actions.delete()}</span>
									</Button>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="top" sideOffset={8}>
								{$LL.common.actions.delete()}
							</Tooltip.Content>
						</Tooltip.Root>
					</div>
				{/if}
			</div>

			<div class="mt-4 min-w-0 space-y-2 text-start">
				<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
					{$LL.common.labels.payment()}
				</p>
				<h1 class="truncate text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
					{formatMoney(payment.amount)}
				</h1>
				<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					<Cell.Date value={payment.date} />
				</div>
			</div>
		</div>

		<Card class="gap-0 overflow-hidden">
			<CardHeader class="gap-2 border-b pb-4">
				<CardTitle class="capitalize">{$LL.common.labels.information()}</CardTitle>
			</CardHeader>
			<CardContent class="py-4">
				<div class="grid gap-3 sm:grid-cols-2 [&>*]:text-start">
					<div class="rounded-xl border bg-muted p-4">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.amount()}
						</p>
						<p class="mt-3 text-sm font-medium tabular-nums">{formatMoney(payment.amount)}</p>
					</div>

					<div class="rounded-xl border bg-muted p-4">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.paymentDate()}
						</p>
						<p class="mt-3 text-sm font-medium"><Cell.Date value={payment.date} /></p>
					</div>

					<div class="rounded-xl border bg-muted p-4">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.tenant()}
						</p>
						<p class="mt-3 truncate text-sm font-medium">{payment.tenantName}</p>
					</div>

					<div class="rounded-xl border bg-muted p-4">
						<p class="text-xs tracking-[0.2em] text-muted-foreground uppercase">
							{$LL.common.labels.contractNumber()}
						</p>
						<p class="mt-3 flex items-center gap-2 text-sm font-medium">
							<Cell.Status status={payment.contractStatus} />
							<span class="truncate tabular-nums">{payment.contractGovId || '—'}</span>
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	</div>

	<PaymentForm
		contractId={payment.contractId}
		value={formOpensOn}
		open={isPaymentFormOpen}
		onOpenChange={(isOpen) => {
			isPaymentFormOpen = isOpen;
		}}
	/>

	<DeleteDialog
		open={isDeleteDialogOpen}
		onOpenChange={(isOpen) => {
			isDeleteDialogOpen = isOpen;
		}}
		onSubmit={deletePayment}
	/>
{/if}
