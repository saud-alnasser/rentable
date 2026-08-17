import type { Locales } from './i18n-types';

export type LocaleMetadata = {
	label: string;
	direction: 'ltr' | 'rtl';
};

export const localesMetadata: Record<Locales, LocaleMetadata> = {
	ar: {
		label: 'العربية',
		direction: 'rtl'
	},
	en: {
		label: 'English',
		direction: 'ltr'
	}
};
