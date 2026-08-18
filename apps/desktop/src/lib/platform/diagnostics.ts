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
