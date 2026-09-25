<script lang="ts" module>
	import type { PaymentReceipt } from '$lib/payment/query';

	/**
	 * Everything a printed receipt carries: what `contract.payments.receipt` answered, and who
	 * issued it.
	 */
	export type PrintedReceiptValue = PaymentReceipt & {
		/** the workspace the payment was recorded in, by the name the shell shows for it. */
		issuer: string;
	};
</script>

<script lang="ts">
	import { formatRecordDate, formatRecordDateRange } from '$lib/design/date';
	import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
	import { i18nObject } from '$lib/i18n/i18n-util';
	import type { PaymentMethod } from '$lib/platform/database/schema';
	import { formatLocaleMoney, formatLocaleNumber } from '$lib/platform/locale';

	/**
	 * A payment's receipt on paper: one page, stated once in Arabic and once in English.
	 *
	 * **Two whole blocks rather than one bilingual list**, because the page is handed to a tenant
	 * who reads it in one language, and a line that runs between two scripts reads well in
	 * neither. Each block carries its own language and direction, so the Arabic is shaped and runs
	 * right to left on the same page as English running left to right, and the Arabic line height
	 * the tokens set for `lang="ar"` applies to it. Values are written in the block's own
	 * language, with Western digits in both (`platform/locale.ts`).
	 *
	 * **What was not recorded is left out, its label with it**: a receipt with no method says
	 * nothing about the method rather than calling it unknown. The payment's note is not printed;
	 * it is the landlord's, not the tenant's.
	 *
	 * It is a receipt, never a tax invoice, and says nothing that reads as one. Drawn for the print
	 * sheet and nowhere else, and it allocates nothing: the cycles and the remainder are the ones
	 * the procedure answered with.
	 */
	let { value }: { value: PrintedReceiptValue } = $props();

	// both are in memory from startup on (`layout/startup.ts`), whichever one the reader chose.
	const blocks: { locale: Locales; dir: 'rtl' | 'ltr'; t: TranslationFunctions }[] = [
		{ locale: 'ar', dir: 'rtl', t: i18nObject('ar') },
		{ locale: 'en', dir: 'ltr', t: i18nObject('en') }
	];

	const methodLabel = (t: TranslationFunctions, method: PaymentMethod) =>
		({
			cash: t.contracts.payments.methods.cash,
			'bank-transfer': t.contracts.payments.methods.bankTransfer,
			cheque: t.contracts.payments.methods.cheque,
			ejar: t.contracts.payments.methods.ejar
		})[method]();

	const reference = $derived(value.payment.reference?.trim() ?? '');
	const govId = $derived(value.contract.govId.trim());
</script>

<article class="flex flex-col gap-8" data-receipt>
	<!-- the reference is the same machine string in both languages, so it is stated once, above
	     both, and read left to right in either. -->
	<p class="text-center font-mono text-sm" dir="ltr" data-receipt-reference>
		{value.reference}
	</p>

	{#each blocks as block (block.locale)}
		{@const t = block.t}
		<section
			lang={block.locale}
			dir={block.dir}
			class="flex break-inside-avoid flex-col gap-4"
			data-receipt-block={block.locale}
		>
			<h1 class="text-lg font-semibold first-letter:uppercase">
				{t.contracts.payments.receipt.title()}
			</h1>

			<dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2">
				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.reference()}
				</dt>
				<dd class="font-mono text-sm"><span dir="ltr">{value.reference}</span></dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.issuedBy()}
				</dt>
				<dd class="font-medium" data-receipt-issuer><bdi>{value.issuer}</bdi></dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.receivedOn()}
				</dt>
				<dd class="font-medium tabular-nums">
					{formatRecordDate(block.locale, value.payment.date)}
				</dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.amount()}
				</dt>
				<dd class="font-semibold tabular-nums" data-receipt-amount>
					{formatLocaleMoney(block.locale, value.payment.amount)}
				</dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.receivedFrom()}
				</dt>
				<dd class="font-medium">
					<bdi>{value.tenant.name}</bdi>
				</dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.common.labels.nationalId()}
				</dt>
				<dd class="font-medium"><span dir="ltr">{value.tenant.nationalId}</span></dd>

				{#if value.payment.method}
					<dt class="text-xs text-muted-foreground first-letter:uppercase" data-receipt-method>
						{t.contracts.payments.method()}
					</dt>
					<dd class="font-medium">{methodLabel(t, value.payment.method)}</dd>
				{/if}

				{#if reference}
					<dt
						class="text-xs text-muted-foreground first-letter:uppercase"
						data-receipt-payment-reference
					>
						{t.contracts.payments.reference()}
					</dt>
					<dd class="font-medium"><span dir="ltr">{reference}</span></dd>
				{/if}

				{#if govId}
					<dt class="text-xs text-muted-foreground first-letter:uppercase">
						{t.common.labels.contractNumber()}
					</dt>
					<dd class="font-medium"><span dir="ltr">{govId}</span></dd>
				{/if}

				<!-- stated whether or not the contract has a number, so a tenant holding two contracts
				     on one unit can tell which this receipt is for. -->
				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.common.labels.contractPeriod()}
				</dt>
				<dd class="font-medium tabular-nums" data-receipt-period>
					{formatRecordDateRange(block.locale, value.contract.start, value.contract.end)}
				</dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.common.labels.units()}
				</dt>
				<dd class="font-medium">
					{#each value.units as unit, index (index)}
						<span class="block"><bdi>{unit.name}</bdi> · <bdi>{unit.complexName}</bdi></span>
					{:else}
						<span>—</span>
					{/each}
				</dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.covers()}
				</dt>
				<dd class="font-medium" data-receipt-cycles>
					{#each value.cycles as cycle (cycle.index)}
						<span class="block tabular-nums" data-receipt-cycle={cycle.index}>
							{t.contracts.payments.receipt.cycle({
								index: formatLocaleNumber(block.locale, cycle.index + 1),
								date: formatRecordDate(block.locale, cycle.due)
							})}
						</span>
					{:else}
						<span>—</span>
					{/each}
				</dd>

				<dt class="text-xs text-muted-foreground first-letter:uppercase">
					{t.contracts.payments.receipt.remaining()}
				</dt>
				<dd class="font-medium tabular-nums" data-receipt-remaining>
					{formatLocaleMoney(block.locale, value.remaining)}
				</dd>
			</dl>
		</section>
	{/each}
</article>
