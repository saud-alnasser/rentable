import { formatLocaleNumber } from '$lib/platform/locale';
import type { FormattersInitializer } from 'typesafe-i18n';
import type { Formatters, Locales } from './i18n-types';

export const initFormatters: FormattersInitializer<Locales, Formatters> = (locale: Locales) => {
	const formatters: Formatters = {
		// the same `Intl` call the money and date treatments make, so a count and an amount on
		// one screen cannot disagree about what a digit looks like — Arabic reads both in
		// Arabic-Indic numerals or neither.
		number: (value: unknown) =>
			typeof value === 'number' ? formatLocaleNumber(locale, value) : String(value)
	};

	return formatters;
};
