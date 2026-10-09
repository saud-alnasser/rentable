<script lang="ts">
	import { resolve } from '$app/paths';
	import { toReadFailure } from '$lib/error/read';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { toPageActions } from '$lib/act';
	import type { Section } from '$lib/feature/surface';
	import { paymentActs } from '$lib/payment/host.svelte';
	import { useFetchPayment } from '$lib/payment/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleMoney } from '$lib/platform/locale';
	import { paymentMethodLabel } from '$lib/payment/method';
	import type { SpecificationEntry } from '@rentable/design/block/specification.svelte';

	let {
		paymentId,
		sections = []
	}: {
		paymentId: string;
		/** what is contributed to a payment's page, its history among them, handed over by the route. */
		sections?: Section<'payment'>[];
	} = $props();

	const paymentQuery = useFetchPayment(() => paymentId);
	const payment = $derived(paymentQuery.data);
	// whether the read behind the page failed, as `$lib/error/read` decides it, and what runs it
	// again: the surface draws the failed state in place of *not found* while it did.
	const paymentRead = $derived(toReadFailure(paymentQuery));

	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

	// which way the money went, first: a refund is money returned to the tenant, and its page says so
	// rather than leaving the amount to read as money received (effort 854, requirement 25). Then
	// how the payment was made, and what was written about it. The method is always stated, as not
	// recorded where nobody said, since its absence is itself something a reader matching a
	// statement needs to know; a reference or a note that was never written is left out whole,
	// label and all, rather than stood in for by an empty line.
	const details = $derived.by((): SpecificationEntry[] => {
		if (!payment) return [];

		return [
			{
				label: $LL.contracts.payments.refund.kind(),
				value:
					payment.direction === 'refund'
						? $LL.contracts.payments.refund.title()
						: $LL.contracts.payments.refund.received()
			},
			{
				label: $LL.contracts.payments.method(),
				value: payment.method
					? paymentMethodLabel(payment.method, $LL)
					: $LL.contracts.payments.methodNotRecorded()
			},
			...(payment.reference
				? [{ label: $LL.contracts.payments.reference(), value: payment.reference }]
				: []),
			...(payment.note ? [{ label: $LL.contracts.payments.note(), value: note }] : [])
		];
	});

	// the page's cluster is a projection of the one list the ledger's card and the command menu read,
	// so it offers what they offer, in their order and under their names: copying on every payment,
	// and what writes refused, with its reason, while its contract is terminated. What each act opens
	// is the payment host's, mounted once in the frame, so this page mounts no form and no dialog.
	const pageActions = $derived(payment ? toPageActions(paymentActs, payment, $LL) : []);

	// the contract the payment is reached through, named as the contract's own page names it (by its
	// tenant), so the trail's crumb and the page it opens say the same thing.
	const parent = $derived(
		payment
			? {
					name: payment.tenantName?.trim() || $LL.common.labels.contract(),
					href: resolve(`/contracts/${payment.contractId}`)
				}
			: undefined
	);

	// what hangs off a payment is what is contributed to its page, a section the reader may not see
	// left out whole.
	const collections = $derived(
		sections
			.filter((section) => section.shows?.() ?? true)
			.map((section) => ({ value: section.value, label: section.label($LL), content: contributed }))
	);
</script>

{#snippet identity()}
	{#if payment}
		<Cell.Date value={payment.date} />
	{/if}
{/snippet}

{#snippet actions()}
	{#each pageActions as act (act.id)}
		<RecordActionControl
			label={act.label}
			icon={act.icon}
			tone={act.tone}
			shortcut={act.shortcut}
			unavailable={act.unavailable}
			onclick={act.run}
		/>
	{/each}
{/snippet}

<!-- a field of its own, under its own label, rather than a glyph beside the contract number: the
     glyph names the contract's state and says nothing about the number it stood beside. Drawn as
     every status is, and as the unit page draws its own. -->
{#snippet contractStatus()}
	{#if payment?.contractStatus}
		<Cell.Status status={payment.contractStatus} />
	{/if}
{/snippet}

<!-- a note keeps the lines it was written in. -->
{#snippet note()}
	{#if payment?.note}
		<bdi class="whitespace-pre-line">{payment.note}</bdi>
	{/if}
{/snippet}

{#snippet fields()}
	<!-- the tenant and the contract are each left out, label and all, where the reader may not view
	     their kind: the read answers without them (effort 838, requirement 10). -->
	<Specification
		entries={[
			...(payment?.tenantName !== undefined
				? [{ label: $LL.common.labels.tenant(), value: payment?.tenantName ?? '' }]
				: []),
			...(payment?.contractStatus !== undefined
				? [
						{
							label: $LL.common.labels.contractNumber(),
							value: payment?.contractGovId || $LL.common.messages.unknown()
						},
						{ label: $LL.common.labels.contractStatus(), value: contractStatus }
					]
				: []),
			...details
		]}
	/>
{/snippet}

{#snippet contributed(value: string)}
	{@const contribution = sections.find((section) => section.value === value)}
	{#if contribution}
		<contribution.component kind="payment" recordId={paymentId} />
	{/if}
{/snippet}

<RecordSurface
	isLoading={paymentQuery.isLoading}
	failed={paymentRead.failed}
	onRetry={paymentRead.retry}
	found={Boolean(payment)}
	backFallback={payment ? resolve(`/contracts/${payment.contractId}`) : resolve('/contracts')}
	path={resolve(`/contracts/payments/${paymentId}`)}
	eyebrow={$LL.common.nav.payments()}
	title={payment ? formatMoney(payment.amount) : ''}
	{parent}
	{identity}
	{actions}
	{fields}
	{collections}
/>
