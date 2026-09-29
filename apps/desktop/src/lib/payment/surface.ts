import { resolve } from '$app/paths';
import { toPaletteActs } from '$lib/act';
import { defineSurface } from '$lib/feature/surface';
import { historySection } from '$lib/history/ui';
import { memberPermissions } from '$lib/permission';
import host from './component/host.svelte';
import { paymentActs, paymentHost } from './host.svelte';
import { useSearchPayments } from './query';
import Ledger from './component/ledger.svelte';
import { useFetchContractPayments } from './query';

export default defineSurface({
	name: 'payment',
	// a payment cannot be without its contract, so the menu asks for the contract first, and the
	// reader has to be able to see contracts to choose one.
	create: {
		subject: 'payment',
		label: (t) => t.common.labels.payment(),
		flags: ['createPayment', 'viewContract'],
		kind: 'asks',
		asks: 'contract',
		create: (contractId) => paymentHost.create({ contractId })
	},
	search: [
		{
			subject: 'payment',
			kind: 'payment',
			heading: (t) => t.common.nav.payments(),
			href: (match) => resolve(`/contracts/payments/${match.id}`),
			find: (term, _asked, { limit }) => useSearchPayments(term, limit)
		}
	],
	acts: [
		{
			subject: 'payment',
			kind: 'payment',
			use: () => ({
				offered: (t, isAppleKeyboard) => toPaletteActs(paymentActs, t, isAppleKeyboard),
				runOn: (actId, paymentId) => paymentHost.runOn(actId, paymentId)
			})
		}
	],
	host,
	sections: [
		// a contract's payments lead its page: a contract exists to be paid. Drawn wherever the
		// reader may see payments at all.
		{
			on: 'contract',
			order: 10,
			value: 'payments',
			label: (t) => t.common.nav.payments(),
			shows: () => memberPermissions.views('payment'),
			component: Ledger
		},
		// the one collection a payment has: what was done to it, as a contract's page shows its own.
		historySection('payment', 10)
	],
	// the payment depends on the contract, so the payments a contract's host weighs a deletion
	// against arrive from here rather than by its importing them.
	contributes: {
		contract: {
			useHeldPayments: (contractId, enabled) => useFetchContractPayments(contractId, enabled),
			viewsPayments: () => memberPermissions.views('payment')
		}
	}
});
