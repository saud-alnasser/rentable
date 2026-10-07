<script lang="ts" module>
	import type { PaymentVoucher } from '$lib/payment/query';
	import type { OrganizationMark } from '$lib/organization';

	/**
	 * Everything a printed voucher carries: what `payment.receipt` answered for a refund, and who
	 * issued it.
	 */
	export type PrintedVoucherValue = PaymentVoucher & {
		/** the organization that paid the refund out, by its name. */
		issuer: string;
		/** the organization's signature or seal, printed at the foot, or nothing where none is set. */
		mark: OrganizationMark | null;
	};
</script>

<script lang="ts">
	import { formatRecordDate, formatRecordDateRange } from '$lib/date';
	import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import { paymentMethodLabel } from '$lib/payment/method';
	import { formatLocaleMoney } from '$lib/platform/locale';

	/**
	 * A refund's payment voucher on paper (سند صرف), as a document in one language: the statement
	 * that the organization paid money out to the tenant, as the receipt is that it received some
	 * (effort 854, requirement 29).
	 *
	 * **It is the receipt's page with the money going the other way** (`receipt.svelte`): one
	 * language, the one chosen in the preview, carrying its own `lang` and `dir`; who issued it at
	 * the head's start, what it is, its number and its date at the end; the amount set apart; then
	 * who it was paid to, how, and for which contract. Where the receipt keeps the note off the page,
	 * the voucher prints it as the reason, since why money went back is what the tenant signs for.
	 * It covers no cycle and states nothing remaining, and it ends with a line for the tenant's
	 * signature. It is not a tax document and says nothing that reads as one.
	 *
	 * **What the procedure left out, the page leaves out**, label and all, on the receipt's terms
	 * (effort 838, requirement 10).
	 */
	let { value, locale }: { value: PrintedVoucherValue; locale: Locales } = $props();

	// every locale is in memory from startup on (`startup/startup.ts`), whichever one is showing.
	const t = $derived<TranslationFunctions>(i18nObject(locale));
	const dir = $derived(locale === 'ar' ? 'rtl' : 'ltr');

	const reference = $derived(value.payment.reference?.trim() ?? '');
	const reason = $derived(value.payment.note?.trim() ?? '');
	const govId = $derived(value.contract?.govId.trim() ?? '');
</script>

{#snippet fact(label: string, name: string)}
	<dt class="text-muted-foreground first-letter:uppercase" data-voucher-label={name}>{label}</dt>
{/snippet}

<article lang={locale} {dir} class="flex flex-col gap-8 text-sm" data-voucher>
	<header class="flex items-start justify-between gap-6 border-b border-border pb-6">
		<p class="text-lg font-semibold" data-voucher-issuer><bdi>{value.issuer}</bdi></p>

		<div class="flex flex-col items-end gap-1 text-end">
			<h1 class="text-xl font-semibold first-letter:uppercase">
				{t.contracts.payments.voucher.title()}
			</h1>
			<p class="text-muted-foreground">
				<span class="first-letter:uppercase">{t.contracts.payments.voucher.number()}</span>
				<span class="font-mono text-foreground" dir="ltr" data-voucher-number>
					{value.reference}
				</span>
			</p>
			<p class="text-muted-foreground tabular-nums" data-voucher-date>
				{formatRecordDate(locale, value.payment.date)}
			</p>
		</div>
	</header>

	<section class="flex items-baseline justify-between gap-6 rounded-xl bg-muted px-6 py-4">
		<span class="text-muted-foreground first-letter:uppercase">
			{t.contracts.payments.voucher.amount()}
		</span>
		<span class="text-xl font-semibold tabular-nums" data-voucher-amount>
			{formatLocaleMoney(locale, value.payment.amount)}
		</span>
	</section>

	<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-3">
		{#if value.tenant}
			<!-- written out rather than through `fact`, as the receipt's is, so the name the test finds
			     it by is the data attribute's own value rather than a kind's word handed around. -->
			<dt class="text-muted-foreground first-letter:uppercase" data-voucher-label="tenant">
				{t.contracts.payments.voucher.paidTo()}
			</dt>
			<dd class="font-medium"><bdi>{value.tenant.name}</bdi></dd>

			{@render fact(t.common.labels.nationalId(), 'nationalId')}
			<dd class="font-medium"><span dir="ltr">{value.tenant.nationalId}</span></dd>
		{/if}

		{#if value.payment.method}
			{@render fact(t.contracts.payments.method(), 'method')}
			<dd class="font-medium">{paymentMethodLabel(value.payment.method, t)}</dd>
		{/if}

		{#if reference}
			{@render fact(t.contracts.payments.reference(), 'reference')}
			<dd class="font-medium"><span dir="ltr">{reference}</span></dd>
		{/if}

		{#if reason}
			{@render fact(t.contracts.payments.voucher.reason(), 'reason')}
			<dd class="font-medium" data-voucher-reason><bdi>{reason}</bdi></dd>
		{/if}

		{#if govId}
			{@render fact(t.common.labels.contractNumber(), 'contractNumber')}
			<dd class="font-medium"><span dir="ltr">{govId}</span></dd>
		{/if}

		{#if value.contract}
			{@render fact(t.common.labels.contractPeriod(), 'period')}
			<dd class="font-medium tabular-nums">
				{formatRecordDateRange(locale, value.contract.start, value.contract.end)}
			</dd>
		{/if}

		{#if value.units}
			{@render fact(t.common.labels.units(), 'units')}
			<dd class="font-medium">
				{#each value.units as unit, index (index)}
					{#if unit.complexName === undefined}
						<span class="block"><bdi>{unit.name}</bdi></span>
					{:else}
						<span class="block"><bdi>{unit.name}</bdi> · <bdi>{unit.complexName}</bdi></span>
					{/if}
				{:else}
					<span>—</span>
				{/each}
			</dd>
		{/if}
	</dl>

	<!-- the tenant signs for the money on a line of their own, and the organization's signature or
	     seal sits at the other end where one is set (effort 835, requirement 13). -->
	<footer class="flex items-end justify-between gap-6 pt-8">
		<div class="flex w-56 flex-col gap-2">
			<span class="block h-12 border-b border-foreground"></span>
			<span class="text-muted-foreground first-letter:uppercase" data-voucher-signature>
				{t.contracts.payments.voucher.signature()}
			</span>
		</div>

		{#if value.mark}
			<div data-printed-mark>
				<img
					src="data:{value.mark.mediaType};base64,{value.mark.data}"
					alt={t.organization.mark.alt()}
					class="h-24 max-w-48 object-contain"
				/>
			</div>
		{/if}
	</footer>
</article>
