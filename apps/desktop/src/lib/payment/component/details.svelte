<script lang="ts">
	import { resolve } from '$app/paths';
	import RecordHistory from '$lib/history/component/record-history.svelte';
	import RecordSurface from '@rentable/design/block/record-surface.svelte';
	import Specification from '@rentable/design/block/specification.svelte';
	import * as Cell from '$lib/design/cell';
	import RecordActionControl from '@rentable/design/block/record-action-control.svelte';
	import { toPageActions } from '$lib/design/acts';
	import { paymentActs } from '$lib/payment/host.svelte';
	import { useFetchPayment } from '$lib/payment/query';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { formatLocaleMoney } from '$lib/platform/locale';

	let { paymentId }: { paymentId: string } = $props();

	const paymentQuery = useFetchPayment(() => paymentId);
	const payment = $derived(paymentQuery.data);

	const formatMoney = (value: number) => formatLocaleMoney($locale, value);

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
	{#if payment}
		<Cell.Status status={payment.contractStatus} />
	{/if}
{/snippet}

{#snippet fields()}
	<Specification
		entries={[
			{ label: $LL.common.labels.tenant(), value: payment?.tenantName ?? '' },
			{
				label: $LL.common.labels.contractNumber(),
				value: payment?.contractGovId || $LL.common.messages.unknown()
			},
			{ label: $LL.common.labels.contractStatus(), value: contractStatus }
		]}
	/>
{/snippet}

<!-- the one collection a payment has: what was done to it, as a contract's record shows its
     own. -->
{#snippet history()}
	<RecordHistory concept="payment" recordId={paymentId} />
{/snippet}

<RecordSurface
	isLoading={paymentQuery.isLoading}
	found={Boolean(payment)}
	backFallback={payment ? resolve(`/contracts/${payment.contractId}`) : resolve('/contracts')}
	path={resolve(`/contracts/payments/${paymentId}`)}
	eyebrow={$LL.common.nav.payments()}
	title={payment ? formatMoney(payment.amount) : ''}
	{parent}
	{identity}
	{actions}
	{fields}
	collections={[{ value: 'history', label: $LL.common.history.title(), content: history }]}
/>
