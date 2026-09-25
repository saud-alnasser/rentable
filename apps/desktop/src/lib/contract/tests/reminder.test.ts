import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRecordDate } from '$lib/design/date.ts';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';

import { CONTRACT_RANKS } from '../rank.ts';
import {
	REMINDER_RANKS,
	composeReminderMessage,
	isReminderRank,
	toWhatsAppUrl,
	type ContractReminder
} from '../reminder.ts';

loadLocale('en');
loadLocale('ar');

const english = i18nObject('en');
const arabic = i18nObject('ar');

/** a tenant owing two cycles of an overdue contract, numbered 20471133, since the first of March. */
const OWED: ContractReminder = {
	rank: 'owing',
	tenantName: 'Noura Al-Qahtani',
	tenantPhone: '+966551234567',
	contractNumber: '20471133',
	amount: 4500,
	due: Date.UTC(2026, 2, 1)
};

/** the same tenant with a cycle falling due this week. */
const COMING_DUE: ContractReminder = { ...OWED, rank: 'due-soon', amount: 1500 };

/** what a WhatsApp address carries as its message, decoded as WhatsApp decodes it. */
const textOf = (url: string) => new URL(url).searchParams.get('text');

// criterion 12(a) of effort 835
test('the address is wa.me on the phone without its plus, with the message URL-encoded', () => {
	const message = 'Hello Noura, the rent of SAR 1,500 & the rest?';
	const url = toWhatsAppUrl('+966551234567', message);

	assert.equal(url, `https://wa.me/966551234567?text=${encodeURIComponent(message)}`);
	// encoded rather than pasted: a space, an ampersand or a question mark in the message would
	// otherwise end the parameter or start another.
	assert.ok(!url.slice(url.indexOf('?') + 1).includes(' '));
	assert.equal(textOf(url), message);
});

test('an Arabic message survives the address whole', () => {
	const message = composeReminderMessage(OWED, arabic, 'ar');
	const url = toWhatsAppUrl(OWED.tenantPhone ?? '', message);

	assert.ok(url.startsWith('https://wa.me/966551234567?text='));
	assert.equal(textOf(url), message);
});

// criterion 12(b) of effort 835, in English
test('in English, the message names the tenant, the amount, the date and the contract', () => {
	const message = composeReminderMessage(OWED, english, 'en');

	assert.equal(
		message,
		'Hello Noura Al-Qahtani, a reminder that the rent of SAR 4,500 on contract 20471133 has been due since 1 Mar 2026. Thank you.'
	);
});

// criterion 12(b) of effort 835, in Arabic
test('in Arabic, the message names the tenant, the amount, the date and the contract', () => {
	const message = composeReminderMessage(OWED, arabic, 'ar');

	assert.ok(message.startsWith('مرحبًا Noura Al-Qahtani،'), message);
	assert.ok(message.includes('4,500 ريال'), message);
	assert.ok(message.includes('العقد رقم 20471133'), message);
	assert.ok(message.includes('مستحق منذ'), message);
	// the date as the application writes one in Arabic, in Western digits.
	assert.ok(message.includes(`مستحق منذ ${formatRecordDate('ar', OWED.due)}`), message);
	assert.ok(message.includes('2026'), message);
	assert.ok(!/[٠-٩]/.test(message), 'no Arabic-Indic digits');
});

test('rent falling due this week is said to fall due, not to be owed, in both languages', () => {
	assert.equal(
		composeReminderMessage(COMING_DUE, english, 'en'),
		'Hello Noura Al-Qahtani, a reminder that the rent of SAR 1,500 on contract 20471133 falls due on 1 Mar 2026. Thank you.'
	);

	const arabicMessage = composeReminderMessage(COMING_DUE, arabic, 'ar');

	assert.ok(
		arabicMessage.includes(`يحلّ في ${formatRecordDate('ar', COMING_DUE.due)}`),
		arabicMessage
	);
	assert.ok(!arabicMessage.includes('مستحق منذ'), arabicMessage);
});

// the human, 2026-09-25: the message fits every contract, so it names the contract rather than
// its units, and one saved without a number is the tenant's contract.
test('a contract with no number is reminded of as the tenant’s contract', () => {
	const unnumbered = { ...OWED, contractNumber: '' };

	assert.equal(
		composeReminderMessage(unnumbered, english, 'en'),
		'Hello Noura Al-Qahtani, a reminder that the rent of SAR 4,500 on your contract has been due since 1 Mar 2026. Thank you.'
	);
	assert.ok(composeReminderMessage(unnumbered, arabic, 'ar').includes('إيجار عقدكم'));
});

test('a reminder is offered on overdue, owing and due soon, and on no other rank or none', () => {
	assert.deepEqual(
		CONTRACT_RANKS.filter((rank) => isReminderRank(rank)),
		[...REMINDER_RANKS]
	);
	assert.deepEqual([...REMINDER_RANKS], ['overdue', 'owing', 'due-soon']);
	assert.equal(isReminderRank('ending-soon'), false);
	assert.equal(isReminderRank(undefined), false);
});
