import { expect, test, vi } from 'vitest';

import { toRefusalText } from '$lib/error/refusal';
import { i18nObject } from '$lib/i18n/i18n-util';
import { loadAllLocales } from '$lib/i18n/i18n-util.sync';
import { consentLostRereadsTheState, keys } from '$lib/organization/query';

/**
 * A CONSENT TURSO NO LONGER ACCEPTS
 *
 * The link refused on 2026-10-06: an organization's own Turso consent was refused as `invalid api
 * token`, and the owner read a sentence that said Turso refused and nothing they could do. Rust now
 * lets the consent go and refuses with `tursoConsentLost` (`turso/platform/live.rs`); this is the
 * interface's half. The sentence sends the owner to the organization's settings, in either
 * language, and every write that spends the consent reads the state again on that refusal, which is
 * what puts the connect card there. Any other refusal reads nothing again.
 */

loadAllLocales();

/** a shell refusal as a `ctx.host` call raises it: inside the error tRPC wraps it in. */
function refusedWith(reason: string): Error {
	return new Error('wrapped by the procedure', {
		cause: { code: 'refused', reason, message: "a developer's description" }
	});
}

test('the refusal tells the owner to connect Turso again from the organization settings', () => {
	const refused = refusedWith('tursoConsentLost');

	expect(toRefusalText(refused, i18nObject('en'))).toBe(
		"Turso no longer accepts this organization's connection. connect Turso again from the organization's settings."
	);
	expect(toRefusalText(refused, i18nObject('ar'))).toBe(
		'لم تعد Turso تقبل اتصال هذه المؤسسة. اربط Turso مرة أخرى من إعدادات المؤسسة.'
	);
});

test('a write the consent was refused on reads the state again', async () => {
	const invalidateQueries = vi.fn(async () => {});

	await consentLostRereadsTheState(
		{ error: refusedWith('tursoConsentLost') },
		{ invalidateQueries }
	);

	expect(invalidateQueries).toHaveBeenCalledOnce();
	expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: keys.state });
});

test('any other refusal reads nothing again', async () => {
	const invalidateQueries = vi.fn(async () => {});

	for (const error of [
		refusedWith('tursoRefused'),
		refusedWith('tursoNotConnected'),
		new Error('not a refusal at all')
	]) {
		await consentLostRereadsTheState({ error }, { invalidateQueries });
	}

	expect(invalidateQueries).not.toHaveBeenCalled();
});
