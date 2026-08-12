<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DeleteDialog from '$lib/design/block/delete-dialog.svelte';
	import RecordSurface from '$lib/design/block/record-surface.svelte';
	import Specification from '$lib/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import { Button } from '$lib/design/primitive/button';
	import * as Tooltip from '$lib/design/primitive/tooltip';
	import { useDeletePayment, useFetchPayment } from '$lib/payment/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleValueWithUnit } from '$lib/platform/locale';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { back } from '$lib/design/back.svelte';
	import RecordActions from '$lib/design/block/record-actions.svelte';
	import PaymentForm from './form.svelte';

	let { paymentId }: { paymentId: number } = $props();

	const paymentQuery = useFetchPayment(() => paymentId);
	const payment = $derived(paymentQuery.data);
	const deleteMutation = useDeletePayment();

	type PaymentFormValue = Omit<NonNullable<typeof paymentQuery.data>, 'id'> & { id?: number };

	let formOpensOn = $state<PaymentFormValue | undefined>(undefined);
	let isPaymentFormOpen = $state(false);
	let isDeleteDialogOpen = $state(false);

	// a terminated contract is read-only, and the refusal is the procedure's — this only
	// decides whether the surface offers the action.
	const isTerminated = $derived(payment?.contractStatus === 'terminated');

	const formatMoney = (value: number) =>
		formatLocaleValueWithUnit($locale, value, $LL.common.messages.sar());

	async function deletePayment() {
		if (!payment) return;

		const contractId = payment.contractId;

		await deleteMutation.mutateAsync(payment.id);
		// the record is gone, so the screen showing it is no longer somewhere back can return
		// to — whatever was open before it is.
		back.forgetCurrent();

		await goto(resolve(`/contracts/${contractId}`));
	}
</script>

{#snippet identity()}
	{#if payment}
		<Cell.Date value={payment.date} />
	{/if}
{/snippet}

{#snippet actions()}
	<!-- copying is a read, so it stands outside the lock that closes what writes. -->
	<RecordActions
		details={[
			{ label: $LL.common.labels.amount(), value: payment ? formatMoney(payment.amount) : '' },
			{ label: $LL.common.labels.tenant(), value: payment?.tenantName ?? '' },
			{ label: $LL.common.labels.contractNumber(), value: payment?.contractGovId ?? '' }
		]}
		onDuplicate={isTerminated || !payment
			? undefined
			: () => {
					formOpensOn = { ...payment, id: undefined };
					isPaymentFormOpen = true;
				}}
	/>

	{#if !isTerminated}
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
			<Tooltip.Content side="top" sideOffset={8}>{$LL.common.actions.edit()}</Tooltip.Content>
		</Tooltip.Root>

		<!-- deleting rests as quietly as any other control here and turns red on the intent to
		     press it; it is primary only inside the confirmation it opens
		     (_Semantics are secondary_). -->
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						size="icon-sm"
						aria-label={$LL.common.actions.delete()}
						class="rounded-full bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
						onclick={() => (isDeleteDialogOpen = true)}
					>
						<Trash2Icon class="size-4" />
						<span class="sr-only">{$LL.common.actions.delete()}</span>
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content side="top" sideOffset={8}>{$LL.common.actions.delete()}</Tooltip.Content>
		</Tooltip.Root>
	{/if}
{/snippet}

{#snippet contractNumber()}
	{#if payment}
		<span class="flex items-center gap-2">
			<Cell.Status status={payment.contractStatus} />
			<span class="tabular-nums">{payment.contractGovId || '—'}</span>
		</span>
	{/if}
{/snippet}

{#snippet fields()}
	<Specification
		entries={[
			{ label: $LL.common.labels.tenant(), value: payment?.tenantName ?? '' },
			{ label: $LL.common.labels.contractNumber(), value: contractNumber }
		]}
	/>
{/snippet}

<RecordSurface
	isLoading={paymentQuery.isLoading}
	found={Boolean(payment)}
	backFallback={payment ? resolve(`/contracts/${payment.contractId}`) : resolve('/contracts')}
	path={resolve(`/contracts/payments/${paymentId}`)}
	eyebrow={$LL.common.labels.payment()}
	title={payment ? formatMoney(payment.amount) : ''}
	{identity}
	{actions}
	{fields}
/>

{#if payment}
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
		record={formatMoney(payment.amount)}
		onSubmit={deletePayment}
	/>
{/if}
