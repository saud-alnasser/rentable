/**
 * CSV
 *
 * turning what a list is showing into a file another program can read.
 *
 * It is written from the rendered rows rather than from the query behind them: a row shows
 * less than its query returns, and an export written from the query would put fields on disk
 * the user never chose to see.
 */

/** A column of the file: what it is called, and what it reads from one record. */
export type CsvColumn<TRecord> = {
	header: string;
	value: (record: TRecord) => string;
};

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
