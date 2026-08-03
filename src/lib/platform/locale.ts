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
