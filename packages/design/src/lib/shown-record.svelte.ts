/**
 * The record a record surface is showing, by name, for the chrome above it to read.
 *
 * The breadcrumb ends on the record, and only the surface knows what the record is called: each
 * concept names its record its own way (a contract by its tenant), and the surface is handed
 * that name as its title. So the surface says it here while it stands, and the chrome reads it,
 * rather than every concept telling the chrome a second time.
 *
 * Three answers, because the chrome draws three different things:
 *
 * - `undefined`: no record surface stands, or the record is still on its way. Nothing is named.
 * - `null`: the surface stands and the record is not there.
 * - a string: the record's name.
 */
class ShownRecord {
	name = $state<string | null | undefined>(undefined);
}

/** what `block/record-surface.svelte` writes and the application's breadcrumb reads. */
export const shownRecord = new ShownRecord();
