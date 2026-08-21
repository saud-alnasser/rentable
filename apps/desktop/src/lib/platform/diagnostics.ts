/**
 * The interface's half of the diagnostics this machine keeps.
 *
 * Nothing collects events from this application, so an event raised here is handed
 * to the same local file everything else writes to, over the Tauri boundary.
 * Redaction happens on the far side of that boundary rather than here: one
 * implementation of what counts as a secret, in the process that owns the file.
 */
import { tauri } from '$lib/platform/tauri';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

/**
 * What a field may be given as. A value that is absent is left out of the
 * record rather than written — a field reading `null` says a value was
 * measured and found empty, which is rarely what was meant.
 */
export type DiagnosticFields = Record<string, string | number | boolean | null | undefined>;

/** Fields as the log holds them: strings, and only the ones that were given. */
export const toDiagnosticFields = (fields: DiagnosticFields = {}) =>
	Object.entries(fields).reduce<Record<string, string>>((written, [name, value]) => {
		if (value !== null && value !== undefined) {
			written[name] = String(value);
		}

		return written;
	}, {});

/**
 * Record one event.
 *
 * Never throws and never rejects. Diagnostics exist to explain a failure and
 * must not become one — a caller that has to guard its own logging is a caller
 * that logs less.
 */
export const recordDiagnostic = (
	level: DiagnosticLevel,
	event: string,
	fields?: DiagnosticFields
) => {
	void tauri.diagnostics
		.write({ level, event, fields: toDiagnosticFields(fields) })
		.catch(() => {});
};

/** Something happened that a later reader would want to see. */
export const recordDiagnosticInfo = (event: string, fields?: DiagnosticFields) =>
	recordDiagnostic('info', event, fields);

/** Something is not a failure yet, but explains one that follows. */
export const recordDiagnosticWarning = (event: string, fields?: DiagnosticFields) =>
	recordDiagnostic('warn', event, fields);

/** Something failed. */
export const recordDiagnosticError = (event: string, fields?: DiagnosticFields) =>
	recordDiagnostic('error', event, fields);

/**
 * Open the folder the diagnostics file is kept in, where this machine keeps one.
 *
 * The one move a person has after being told the application will not start, so it is here rather
 * than on the screen that offers it: two screens offer it now, and the second one is drawn in a
 * state where nothing else about the application can be relied on.
 *
 * **It reports nothing when it fails.** Every caller is already a screen reporting a failure, and
 * a second failure on top of the first tells a reader nothing they can act on.
 */
export const revealDiagnostics = async () => {
	try {
		const settings = await tauri.settings.get();

		if (settings.diagnosticsDir) {
			await tauri.opener.revealItemInDir(settings.diagnosticsDir);
		}
	} catch {
		/* the screen this was pressed on is already reporting a failure */
	}
};
