import type { ContractLike } from '$lib/contract/contract';
import { getDueSoonCycle, type ContractRank } from '$lib/contract/rank';
import { scheduleContract, type SchedulePaymentLike } from '$lib/contract/schedule';
import { formatRecordDate } from '$lib/design/date';
import type { Locales, TranslationFunctions } from '$lib/i18n/i18n-types';
import { formatLocaleNumber } from '$lib/platform/locale';

/**
 * REMINDER
 *
 * The message a tenant is reminded with, and the WhatsApp address that opens with it written.
 *
 * The application sends nothing and records nothing: it opens WhatsApp addressed to the tenant
 * with the message in the language the application is showing, and the landlord reads it and
 * sends it (effort 835, requirement 12). What the message states is read by `contract.reminder`;
 * everything here is pure, so the words and the address are tested without a database.
 */

/**
 * The ranks a tenant can be reminded on: what is late, what is owed today, and the rent falling
 * due this week. A contract up for renewal owes nothing, so there is nothing to remind anyone of.
 */
export const REMINDER_RANKS = [
	'overdue',
	'owing',
	'due-soon'
] as const satisfies readonly ContractRank[];

/** One of the ranks a reminder is offered on. */
export type ReminderRank = (typeof REMINDER_RANKS)[number];

/** Whether a contract under this rank, or under none, is one its tenant can be reminded on. */
export function isReminderRank(rank: ContractRank | undefined): rank is ReminderRank {
	return rank !== undefined && (REMINDER_RANKS as readonly ContractRank[]).includes(rank);
}

/**
 * What a reminder states, as `contract.reminder` reads it.
 *
 * On a money rank the amount is everything late or due today and not covered, and the date is the
 * earliest of those cycles' due dates, which is how long the rent has been owed. On a due-soon
 * contract the amount is what the cycle coming due still lacks, and the date is the day it falls
 * due.
 */
export type ContractReminder = {
	rank: ReminderRank;
	/**
	 * the tenant's name and phone, absent for a member who may not view tenants (effort 838,
	 * requirement 10), who is not offered a reminder for that reason.
	 */
	tenantName?: string;
	/** a machine string, `+9665XXXXXXXX`, as a tenant's phone is stored. */
	tenantPhone?: string;
	/** the contract's number, which the message names it by; empty where it has none. */
	contractNumber: string;
	amount: number;
	/** a UTC day, as every date in the contract domain crosses. */
	due: number;
};

/**
 * The amount a reminder states and the date it gives, from the contract's schedule.
 *
 * On a money rank, what the late cycles and the one due today still lack, and the earliest of
 * their due dates, which is since when the rent has been owed. On a due-soon contract, what the
 * cycle coming due still lacks and the day it falls due, read the way the rank itself read it
 * ({@link getDueSoonCycle}), so the reminder never names a cycle the rank did not.
 */
export function getReminderFigures(
	contract: ContractLike & { paidAmount: number },
	payments: SchedulePaymentLike[],
	rank: ContractReminder['rank'],
	now: number
) {
	if (rank === 'due-soon') {
		const cycle = getDueSoonCycle(contract, contract.paidAmount, now);

		return cycle ? { amount: cycle.amount, due: cycle.due.getTime() } : undefined;
	}

	const owed = scheduleContract(contract, payments, now).cycles.filter(
		(cycle) => cycle.state === 'late' || cycle.state === 'due'
	);

	if (owed.length === 0) {
		return undefined;
	}

	return {
		amount: owed.reduce((sum, cycle) => sum + cycle.amount - cycle.covered, 0),
		due: Math.min(...owed.map((cycle) => cycle.due.getTime()))
	};
}

/**
 * The reminder written out in one locale: the tenant by name, the amount, the date, and the
 * contract.
 *
 * A money rank says since when the rent has been due and a due-soon contract says when it falls
 * due, so a tenant who owes is not told the rent is coming. The contract is named by its number,
 * which the tenant holds on their own copy and which fits any contract, however many units it
 * holds or however they are named; one with no number is *your contract*. *It listed the units
 * until the human asked, on 2026-09-25, for a message that fits every contract.*
 *
 * The amount is written in Western digits with the currency as a word, not the riyal sign the
 * screen draws: the message is read in whatever WhatsApp shows it in, and a sign that font has
 * no glyph for reaches the tenant as an empty box.
 */
export function composeReminderMessage(
	reminder: ContractReminder,
	t: TranslationFunctions,
	locale: Locales
): string {
	const values = {
		tenant: reminder.tenantName?.trim() ?? '',
		amount: formatLocaleNumber(locale, reminder.amount),
		date: formatRecordDate(locale, reminder.due),
		contract: reminder.contractNumber.trim()
	};
	const messages = t.contracts.reminder;
	const isComingDue = reminder.rank === 'due-soon';

	if (!values.contract) {
		return isComingDue ? messages.comingDueNoNumber(values) : messages.owedNoNumber(values);
	}

	return isComingDue ? messages.comingDue(values) : messages.owed(values);
}

/**
 * The address that opens WhatsApp on a chat with this phone, the message already written.
 *
 * `wa.me` takes the number in international form with no `+` and nothing else around it, and the
 * message as the `text` parameter, URL-encoded so that Arabic, spaces and punctuation arrive as
 * they were written.
 */
export function toWhatsAppUrl(phone: string, message: string): string {
	const number = phone.replace(/\D/g, '');

	return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
