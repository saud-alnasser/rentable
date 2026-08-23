import { regex } from '@rentable/design/identifier.js';
import { TRPCError } from '@trpc/server';

/**
 * IDENTITY
 *
 * the creating client mints a row's identity, and a caller may state one instead — which is
 * how undoing a deletion puts a row back as the record it was rather than as a copy of it
 * (ADR 0026).
 *
 * A stated identity has to be free, and that is not a formality: an undo replays an id that
 * was deleted, and nothing stops the same id being stated twice. Without this the collision
 * arrives as a constraint failure the user is shown as an unexpected error, rather than as the
 * refusal it is.
 *
 * *It used to say the engine hands out the next id above the highest in use, which was the
 * reason a freed id could be taken. That rule is gone — {@link newId} is where identities come
 * from now — and the check it justified is not, because a stated id is still a stated id.*
 *
 * @param existing whatever row the caller's lookup found; any row means the id is taken.
 * @param named how the offending record is referred to, where the caller is acting on a set and
 * has to say which member of it was refused. A caller acting on one record omits it: the record
 * is the one it was asked about.
 */
export function ensureIdFree(existing: unknown, named?: string) {
	if (existing) {
		throw new TRPCError({
			code: 'BAD_REQUEST',
			message: `another record already holds ${named ? `the id ${named}` : 'that id'}`
		});
	}
}

/**
 * The last millisecond an identity was minted in, and the counter that orders the ones minted
 * inside it. Process-local, and that is the whole extent of the guarantee below.
 */
let lastAt = 0;
let sequence = 0;

/**
 * A new identity, minted where the record is created rather than by the engine that stores it.
 *
 * **UUIDv7**, hex, lowercase: a 48-bit millisecond timestamp, then a 12-bit counter, then
 * randomness. The timestamp is what makes it sort in creation order, which is the property
 * nineteen queries in this application already lean on by ordering on an id — decision 13 chose
 * it over ULID for exactly that, at the same width a `TEXT` primary key costs either way.
 *
 * **The counter is why two records created in the same millisecond still sort in the order they
 * were created.** A clock in milliseconds does not separate a batch of rows written together,
 * and `history` orders by identity after time precisely to break that tie — with a random tail
 * that tie would break arbitrarily, so the entry written second could read as the first. The
 * counter starts somewhere random in the low half of its range each millisecond and climbs from
 * there, so it orders without becoming a guessable sequence; if it ever exhausted the range it
 * borrows a millisecond from the future rather than wrapping backwards. Ordering across two
 * processes is still the timestamp's alone, which is the same guarantee UUIDv7 makes.
 *
 * **It takes no clock.** Every other time in this application comes from the injected one, and
 * this is the deliberate exception: an id is minted below the router, on both sides of the
 * wire, and a fixed test clock would give every row in a test the same 48 bits — leaving the
 * tail to decide an order the timestamp is here to fix.
 */
export function newId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	const now = Date.now();

	if (now > lastAt) {
		lastAt = now;
		// the low half of the range, so a millisecond has room to climb without borrowing
		sequence = ((bytes[6] & 0x07) << 8) | bytes[7];
	} else if (sequence >= 0xfff) {
		lastAt += 1;
		sequence = 0;
	} else {
		sequence += 1;
	}

	for (let index = 0; index < 6; index += 1) {
		bytes[index] = Math.floor(lastAt / 2 ** (8 * (5 - index))) & 0xff;
	}

	// version 7 in the high nibble of byte 6, then the counter across its low nibble and byte 7;
	// variant 0b10 in the top bits of byte 8. Everything below is the random tail.
	bytes[6] = 0x70 | ((sequence >> 8) & 0x0f);
	bytes[7] = sequence & 0xff;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Whether a value is an identity at all, which is not the same question as whether a record
 * holds it.
 *
 * It exists for the route parameter that is still resolving: a page reads its id from the URL
 * before the record is loaded, and until it is there the value is not an id yet. It replaces
 * `Number.isInteger(id) && id > 0`, which answered the same question against the old scheme —
 * an absent parameter became `NaN` there and an empty string fails this, so a gate below one
 * of these behaves as it always did.
 *
 * Built on the identifier grammar `@rentable/design/identifier.js` already declares, so the breadcrumb
 * trail and the query gates agree on what an id looks like.
 */
export function isRecordId(id: unknown): id is string {
	return typeof id === 'string' && regex.identifier.uuid.test(id);
}
