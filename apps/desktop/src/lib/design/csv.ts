/**
 * CSV
 *
 * turning what a list is showing into a file another program can read.
 *
 * It is written from the rendered rows rather than from the query behind them: a row shows
 * less than its query returns, and an export written from the query would put fields on disk
 * the user never chose to see.
 *
 * Two formats are offered now and the columns are the same for both — the difference is only
 * in what lands on disk. {@link toExportSheet} is the other rendering; the format itself is
 * built in Rust, for the reasons the effort's evidence records.
 */
import type { ExportSheet } from '$lib/platform/tauri';

/** A column of the file: what it is called, and what it reads from one record. */
export type CsvColumn<TRecord> = {
	header: string;
	value: (record: TRecord) => string;
};

/** The formats a list can be written out as. */
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;

/** One of them. */
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Whether a spreadsheet would run the value rather than show it.
 *
 * `=` and `@` always open a formula. `+` and `-` only do where what follows is not a number,
 * which is what keeps a phone number — `+966…`, the shape every tenant here has — out of the
 * guard below.
 */
function opensAFormula(value: string) {
	return /^[=@]/.test(value) || /^[+-](?![\d\s.,])/.test(value);
}

/**
 * Quote a field the way RFC 4180 asks for, and defuse one a spreadsheet would execute.
 *
 * A leading quote is what turns a formula back into text: without it a tenant named `=cmd()`
 * is run by whatever opens the file rather than shown.
 */
function toField(value: string) {
	const guarded = opensAFormula(value) ? `'${value}` : value;

	return `"${guarded.replace(/"/g, '""')}"`;
}

/**
 * The whole file, headers first, rows in the order they were given.
 *
 * Lines end `\r\n` because that is what the format says and what a spreadsheet on any
 * platform reads back unambiguously.
 */
export function toCsv<TRecord>(columns: CsvColumn<TRecord>[], records: TRecord[]) {
	const lines = [
		columns.map((column) => toField(column.header)),
		...records.map((record) => columns.map((column) => toField(column.value(record))))
	];

	return lines.map((fields) => fields.join(',')).join('\r\n');
}

/**
 * The same columns and records as a workbook's one sheet.
 *
 * Nothing is quoted and nothing is defused here. A cell in an archive is not delimited by
 * anything, so quoting would put the quotes themselves in the cell — and the formula guard is
 * the file format's question, answered by the writer that knows which format it is writing.
 * What this owes is the values, in the order the columns were declared.
 */
export function toExportSheet<TRecord>(
	columns: CsvColumn<TRecord>[],
	records: TRecord[]
): ExportSheet {
	return {
		headers: columns.map((column) => column.header),
		rows: records.map((record) => columns.map((column) => column.value(record)))
	};
}

/** What a file of this format is called, given what the list calls itself. */
export function toExportFileName(name: string, format: ExportFormat) {
	// the name a list gives already carries `.csv`, from when that was the only format there
	// was. Stripping it keeps the caller's word — the concept's own name for itself — without
	// making every list restate it.
	return `${name.replace(/\.(csv|xlsx)$/i, '')}.${format}`;
}
