<script lang="ts" module>
	import type { PaymentReceipt } from '$lib/payment/query';
	import type { OrganizationMark } from '$lib/platform/tauri';

	/**
	 * Everything a printed receipt carries: what `contract.payments.receipt` answered, and who
	 * issued it.
	 */
	export type PrintedReceiptValue = PaymentReceipt & {
		/** the organization the payment was recorded for, by its name. */
		issuer: string;
		/** the organization's signature or seal, printed at the foot, or nothing where none is set. */
		mark: OrganizationMark | null;
	};
</script>

<script lang="ts">
	import { formatRecordDate, formatRecordDateRange } from '$lib/design/date';
	import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import type { PaymentMethod } from '$lib/platform/database/schema';
	import { formatLocaleMoney, formatLocaleNumber } from '$lib/platform/locale';

	/**
	 * A payment's receipt on paper, as a document in one language.
	 *
	 * **One language, the one the reader chose** in the preview (effort 835, requirement 10,
	 * revised): two languages on one page read as clutter, and a receipt is handed to a tenant who
	 * reads it in one. The page carries its own `lang` and `dir`, so an Arabic receipt runs right to
	 * left and takes the Arabic line height whatever the application is showing, and its values are
	 * written in that language with Western digits (`platform/locale.ts`).
	 *
	 * **It reads as a document**: who issued it at the head's start and what it is, its number and
	 * its date at the end; then the amount, set apart because it is what a receipt is for; then who
	 * paid and what for; then what remains. What was not recorded is left out with its label, and
	 * the payment's note stays off the page: it is the landlord's, not the tenant's.
	 *
	 * It is a receipt, never a tax invoice, and says nothing that reads as one. It allocates
	 * nothing: the cycles and the remainder are the ones the procedure answered with.
	 */
	let { value, locale }: { value: PrintedReceiptValue; locale: Locales } = $props();

	// every locale is in memory from startup on (`layout/startup.ts`), whichever one is showing.
	const t = $derived<TranslationFunctions>(i18nObject(locale));
	const dir = $derived(locale === 'ar' ? 'rtl' : 'ltr');

	const methodLabel = (method: PaymentMethod) =>
		({
			cash: t.contracts.payments.methods.cash,
			'bank-transfer': t.contracts.payments.methods.bankTransfer,
			cheque: t.contracts.payments.methods.cheque,
			ejar: t.contracts.payments.methods.ejar
		})[method]();

	const reference = $derived(value.payment.reference?.trim() ?? '');
	const govId = $derived(value.contract.govId.trim());
</script>

{#snippet fact(label: string, name: string)}
	<dt class="text-muted-foreground first-letter:uppercase" data-receipt-label={name}>{label}</dt>
{/snippet}

<article lang={locale} {dir} class="flex flex-col gap-8 text-sm" data-receipt>
	<header class="flex items-start justify-between gap-6 border-b border-border pb-6">
		<p class="text-lg font-semibold" data-receipt-issuer><bdi>{value.issuer}</bdi></p>

		<div class="flex flex-col items-end gap-1 text-end">
			<h1 class="text-xl font-semibold first-letter:uppercase">
				{t.contracts.payments.receipt.title()}
			</h1>
			<p class="text-muted-foreground">
				<span class="first-letter:uppercase">{t.contracts.payments.receipt.reference()}</span>
				<span class="font-mono text-foreground" dir="ltr" data-receipt-reference>
					{value.reference}
				</span>
			</p>
			<p class="text-muted-foreground tabular-nums" data-receipt-date>
				{formatRecordDate(locale, value.payment.date)}
			</p>
		</div>
	</header>

	<section class="flex items-baseline justify-between gap-6 rounded-xl bg-muted px-6 py-4">
		<span class="text-muted-foreground first-letter:uppercase">
			{t.contracts.payments.receipt.amount()}
		</span>
		<span class="text-xl font-semibold tabular-nums" data-receipt-amount>
			{formatLocaleMoney(locale, value.payment.amount)}
		</span>
	</section>

	<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-8 gap-y-3">
		{@render fact(t.contracts.payments.receipt.receivedFrom(), 'tenant')}
		<dd class="font-medium"><bdi>{value.tenant.name}</bdi></dd>

		{@render fact(t.common.labels.nationalId(), 'nationalId')}
		<dd class="font-medium"><span dir="ltr">{value.tenant.nationalId}</span></dd>

		{#if value.payment.method}
			{@render fact(t.contracts.payments.method(), 'method')}
			<dd class="font-medium">{methodLabel(value.payment.method)}</dd>
		{/if}

		{#if reference}
			{@render fact(t.contracts.payments.reference(), 'reference')}
			<dd class="font-medium"><span dir="ltr">{reference}</span></dd>
		{/if}

		{#if govId}
			{@render fact(t.common.labels.contractNumber(), 'contractNumber')}
			<dd class="font-medium"><span dir="ltr">{govId}</span></dd>
		{/if}

		<!-- stated whether or not the contract has a number, so a tenant holding two contracts on
		     one unit can tell which this receipt is for. -->
		{@render fact(t.common.labels.contractPeriod(), 'period')}
		<dd class="font-medium tabular-nums" data-receipt-period>
			{formatRecordDateRange(locale, value.contract.start, value.contract.end)}
		</dd>

		{@render fact(t.common.labels.units(), 'units')}
		<dd class="font-medium">
			{#each value.units as unit, index (index)}
				<span class="block"><bdi>{unit.name}</bdi> · <bdi>{unit.complexName}</bdi></span>
			{:else}
				<span>—</span>
			{/each}
		</dd>

		{@render fact(t.contracts.payments.receipt.covers(), 'cycles')}
		<dd class="font-medium" data-receipt-cycles>
			{#each value.cycles as cycle (cycle.index)}
				<span class="block tabular-nums" data-receipt-cycle={cycle.index}>
					{t.contracts.payments.receipt.cycle({
						index: formatLocaleNumber(locale, cycle.index + 1),
						date: formatRecordDate(locale, cycle.due)
					})}
				</span>
			{:else}
				<span>—</span>
			{/each}
		</dd>
	</dl>

	<footer class="flex items-baseline justify-between gap-6 border-t border-border pt-4">
		<span class="text-muted-foreground first-letter:uppercase">
			{t.contracts.payments.receipt.remaining()}
		</span>
		<span class="font-semibold tabular-nums" data-receipt-remaining>
			{formatLocaleMoney(locale, value.remaining)}
		</span>
	</footer>
	<!-- the organization's signature or seal, at the foot where a receipt is signed; a page with
	     none set has an empty foot (effort 835, requirement 13). -->
	{#if value.mark}
		<footer class="flex justify-end pt-4" data-printed-mark>
			<img
				src="data:{value.mark.mediaType};base64,{value.mark.data}"
				alt={t.organization.mark.alt()}
				class="h-24 max-w-48 object-contain"
			/>
		</footer>
	{/if}
</article>
