import type { Icon } from '$lib/feature/surface';
import type { TranslationFunctions } from '$lib/i18n/i18n-types';
import { PAYMENT_METHODS, type PaymentMethod } from '$lib/platform/database/schema';
import GlobeIcon from '@lucide/svelte/icons/globe';
import HandCoinsIcon from '@lucide/svelte/icons/hand-coins';
import LandmarkIcon from '@lucide/svelte/icons/landmark';
import PenLineIcon from '@lucide/svelte/icons/pen-line';

/**
 * HOW A PAYMENT WAS MADE
 *
 * The one place a payment method is given its word and its glyph, read by the ledger's rows, the
 * payment's page, its form and its receipt (effort 846, requirement 20). Each surface used to spell
 * the four words out for itself; `satisfies` is what makes a method added to the schema without a
 * word or a glyph a build failure rather than a blank on one of them.
 *
 * The glyphs are none of the ones a payment already wears elsewhere: not `banknote`, which counts
 * a contract's payments on its card, and not `coins`, which is the dashboard's outstanding.
 */
const METHODS = {
	cash: { label: (t) => t.contracts.payments.methods.cash(), glyph: HandCoinsIcon },
	'bank-transfer': {
		label: (t) => t.contracts.payments.methods.bankTransfer(),
		glyph: LandmarkIcon
	},
	cheque: { label: (t) => t.contracts.payments.methods.cheque(), glyph: PenLineIcon },
	ejar: { label: (t) => t.contracts.payments.methods.ejar(), glyph: GlobeIcon }
} satisfies Record<PaymentMethod, { label: (t: TranslationFunctions) => string; glyph: Icon }>;

/** the method's word, in the language `t` speaks. */
export const paymentMethodLabel = (method: PaymentMethod, t: TranslationFunctions) =>
	METHODS[method].label(t);

/** the method's glyph, drawn beside its word and never in place of it. */
export const paymentMethodGlyph = (method: PaymentMethod): Icon => METHODS[method].glyph;

/**
 * the four methods in the order a reader meets them: in hand, by the bank, by a cheque, through
 * Ejar's SADAD bill. The schema's order, which is that one.
 */
export const paymentMethods = (t: TranslationFunctions) =>
	PAYMENT_METHODS.map((value) => ({ value, label: paymentMethodLabel(value, t) }));
