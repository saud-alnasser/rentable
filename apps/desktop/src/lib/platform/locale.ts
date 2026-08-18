import { localesMetadata } from '$lib/i18n/i18n-translations-util';
import type { Locales } from '$lib/i18n/i18n-types';

const intlLocaleMap: Record<Locales, string> = {
	ar: 'ar-SA',
	en: 'en-GB'
};

export function getIntlLocale(locale: Locales) {
	return intlLocaleMap[locale] ?? locale;
}

export function isRtlLocale(locale: Locales) {
	return localesMetadata[locale].direction === 'rtl';
}

export function formatLocaleNumber(
	locale: Locales,
	value: number,
	options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }
) {
	return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

export function formatLocaleDate(
	locale: Locales,
	value: number | string | Date,
	options: Intl.DateTimeFormatOptions
) {
	const date = value instanceof Date ? value : new Date(value);

	return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(date);
}

/**
 * The currency this application deals in, as the symbol rather than as a word.
 *
 * `U+20C1 SAUDI RIYAL SIGN`, the mark adopted in 2025 — **not** `U+FDFC RIAL SIGN`, which is the
 * older calligraphic form shared with the Iranian rial, and not `U+20C0`, which is the som and
 * sits immediately before it in the same block.
 *
 * Not a translation, deliberately: a symbol is the same mark in every language, and putting it
 * in the two locale files is two places to disagree about one currency.
 */
export const RIYAL = '⃁';

/** left-to-right isolate, and the pop that closes it. */
const LTR_ISOLATE = '⁦';
const POP_ISOLATE = '⁩';

/**
 * An amount, with the riyal symbol to the left of it in every locale.
 *
 * The isolate is what makes *to the left* true rather than hoped for. Left and right are not
 * fixed positions in a bidirectional document — the same string of symbol-then-digits renders
 * one way inside an English sentence and the other way inside an Arabic one, and which way
 * depends on the bidi class of the symbol, which is a property of the character rather than
 * something this application chooses. Forcing the pair left-to-right and isolating it from the
 * text around it settles the question here instead of leaving it to the sentence.
 *
 * A non-breaking space, so an amount is never broken across a line between its symbol and its
 * figure.
 */
export function formatLocaleMoney(locale: Locales, value: number | string) {
	const amount = typeof value === 'number' ? formatLocaleNumber(locale, value) : value.trim();

	return `${LTR_ISOLATE}${RIYAL}\u00a0${amount}${POP_ISOLATE}`;
}

/** The same, for a figure read against the total it is part of. */
export function formatLocaleMoneyRange(
	locale: Locales,
	start: number | string,
	end: number | string
) {
	const formattedStart =
		typeof start === 'number' ? formatLocaleNumber(locale, start) : start.trim();
	const formattedEnd = typeof end === 'number' ? formatLocaleNumber(locale, end) : end.trim();

	return formatLocaleMoney(locale, `${formattedStart} / ${formattedEnd}`);
}

export function formatLocaleValueWithUnit(locale: Locales, value: number | string, unit: string) {
	const formattedValue =
		typeof value === 'number' ? formatLocaleNumber(locale, value) : value.trim();

	return isRtlLocale(locale) ? `${unit} ${formattedValue}` : `${formattedValue} ${unit}`;
}

export function formatLocaleRangeWithUnit(
	locale: Locales,
	start: number | string,
	end: number | string,
	unit: string
) {
	const formattedStart =
		typeof start === 'number' ? formatLocaleNumber(locale, start) : start.trim();
	const formattedEnd = typeof end === 'number' ? formatLocaleNumber(locale, end) : end.trim();

	return formatLocaleValueWithUnit(locale, `${formattedStart} / ${formattedEnd}`, unit);
}
