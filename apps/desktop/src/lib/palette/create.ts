import type { CreateEntry } from '$lib/feature/surface';
import type { RecordFlag } from '$lib/permission';

/**
 * THE COMMAND MENU'S CREATE GROUP
 *
 * Every concept a person can create, as the command menu offers it (effort 832, requirement 9).
 * Each concept declares its entry in its own `surface.ts` (`CreateEntry`), and the group is those
 * entries in the surfaces' order, which is the order records are searched ({@link createPalette}).
 * What is here is which of them the reader is offered.
 *
 * **Each entry names the flags it needs** (effort 838, requirement 10), and the command menu
 * offers only the entries the reader holds every flag of ({@link toOfferedCreates}).
 */

/**
 * The entries of the create group the reader may use: those whose every flag they hold. An entry
 * they may not use is left out rather than refused, as a record's act they lack is
 * (`toPaletteActs`), since the menu is searched by name and a row that can never run would answer
 * every search for it.
 */
export function toOfferedCreates(
	creates: readonly CreateEntry[],
	refusal: (flags: readonly RecordFlag[]) => string | undefined
): CreateEntry[] {
	return creates.filter((create) => refusal(create.flags) === undefined);
}
