import type { Locales } from '$lib/i18n/i18n-types';
import { getIntlLocale } from '$lib/platform/locale';

/**
 * HOW LONG A LINK LASTS, AS ITS MAKER CHOOSES
 *
 * Effort 851, requirement 11: whoever makes a link chooses how long it and its code last, every
 * hour from one to twenty-three, then every day from one to six, then a week, and nothing else,
 * starting at three days. The list is Rust's `invitation::LinkLifetime` mirrored, in hours, which
 * is what crosses as `lifetimeHours`; Rust refuses anything off it as `linkLifetime`, and the
 * router's schema refuses it first.
 */

const HOURS_IN_A_DAY = 24;

/** every lifetime a link may be made with, in hours, shortest first. */
export const LINK_LIFETIME_HOURS: readonly number[] = [
	...Array.from({ length: 23 }, (_, index) => index + 1),
	...Array.from({ length: 6 }, (_, index) => (index + 1) * HOURS_IN_A_DAY),
	7 * HOURS_IN_A_DAY
];

/** where the choice starts: three days, long enough to be opened tomorrow. */
export const DEFAULT_LINK_LIFETIME_HOURS = 3 * HOURS_IN_A_DAY;

export const isLinkLifetime = (hours: number) => LINK_LIFETIME_HOURS.includes(hours);

/**
 * a lifetime as the reader's own language counts it, "5 hours", "3 days", "1 week", in the digits
 * `getIntlLocale` decides. **The words are the locale's rather than this application's**, as a
 * relative time's are (`formatLocaleRelativeTime`): Arabic counts one, two, few and many
 * differently, and a table of strings would carry that grammar twice.
 */
export function formatLinkLifetime(locale: Locales, hours: number) {
	const [count, unit] =
		hours < HOURS_IN_A_DAY
			? [hours, 'hour']
			: hours === 7 * HOURS_IN_A_DAY
				? [1, 'week']
				: [hours / HOURS_IN_A_DAY, 'day'];

	const intlLocale = getIntlLocale(locale);

	return new Intl.NumberFormat(intlLocale, {
		style: 'unit',
		unit,
		unitDisplay: 'long'
	}).format(count);
}
