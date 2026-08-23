/**
 * EXPORT
 *
 * turning what a list is showing into a file another program can read.
 *
 * It is written from the rendered rows rather than from the query behind them: a row shows
 * less than its query returns, and an export written from the query would put fields on disk
 * the user never chose to see.
 *
 * **What a column carries is its kind, not its rendering.** A count crosses as a count and a
 * date as a date, and the file's own writer decides how each is spelled. The alternative was
 * tried first: every cell was rendered here, through the reader's locale, so `١٬٥٠٠` and
 * `﷼ 1,500` went to disk as text. It made every figure unaddable and every date unsortable,
 * and it stamped a locale on a file whose reader had not chosen one — a spreadsheet renders a
 * number in whatever locale the person opening it works in, and can do nothing at all with a
 * string that looks like one.
 *
 * Two formats are offered and the columns are the same for both; the difference is only in what
 * lands on disk. Which is also why the writing itself is not here: choosing a path and putting
 * bytes on it is the consumer's, handed in as {@link ExportWriter}.
 *
 * *That last sentence read "both formats are built in Rust for the reasons the effort's evidence
 * records" while this module lived in the desktop application. It was true of that consumer and
 * is a statement this side can no longer make about any of them.*
 */

/**
 * One cell of a workbook, as the kind of thing it is.
 *
 * Money and dates cross as figures rather than as the text a surface drew, because the file's
 * reader is a spreadsheet: it renders a number in whatever locale the person opening it works
 * in, and can do nothing with a string that merely looks like one. `date` is the count of days
 * the format itself counts in.
 *
 * **Declared here rather than imported from the writer that receives it.** The same shape is
 * declared a second time by whatever host a consumer writes through, and a third time by the
 * process that puts it on disk; this one belongs to the side that builds the value. The two are
 * structural, so a consumer handing {@link toExportSheet}'s result to its own writer type-checks
 * without a cast.
 *
 * **That is a check in one direction and it is worth knowing which.** A host that starts
 * requiring a field, or narrows one, stops accepting what this builds and the consumer's own
 * gate says so. A host that *drops* a field still accepts it, because the value arrives through a
 * variable rather than as an object literal and the excess is permitted. So the direction that
 * matters is covered and the other is not, which is why this is stated rather than assumed.
 */
export type ExportCell =
	| { kind: 'text'; value: string }
	| { kind: 'number'; value: number }
	| { kind: 'date'; value: number }
	| { kind: 'money'; value: number }
	| { kind: 'empty' };

/** One sheet of a workbook: its headings, and its rows under them. */
export type ExportSheet = {
	/**
	 * what the tab is called.
	 *
	 * Left out where the workbook holds one sheet — there is nothing to tell it apart from.
	 * Given where it holds several, which is how a reader finds one concept inside a whole
	 * workspace.
	 */
	name?: string;
	headers: string[];
	rows: ExportCell[][];
};

/**
 * One cell, as the kind of thing it is.
 *
 * A concept says *this is money* and *this is the day it fell due*; nothing here decides how
 * either is spelled, because that is the file format's question and the two formats answer it
 * differently.
 */
export type ExportValue =
	| string
	| number
	| null
	| undefined
	| { kind: 'date'; value: Date }
	| { kind: 'money'; value: number };

/** the day a spreadsheet counts from. Serial 1 is 1900-01-01 in the format's own reckoning. */
const SPREADSHEET_EPOCH = Date.UTC(1899, 11, 30);
const MILLISECONDS_A_DAY = 86_400_000;

/** A date as the count of days a spreadsheet holds one as. */
function toSerialDay(value: Date) {
	return (value.getTime() - SPREADSHEET_EPOCH) / MILLISECONDS_A_DAY;
}

/**
 * A label as a file spells it.
 *
 * The interface writes its labels lowercase, deliberately and everywhere. A file is not the
 * interface: a heading row is read by people who did not open this application and by programs
 * that treat the first row as names, and `national id` reads as an unfinished sentence where
 * `National Id` reads as a column. Done here rather than by every list restating its labels in
 * two cases, and a no-op in a script that has no cases at all — which is why the Arabic
 * headings pass through untouched.
 */
export function toHeading(label: string) {
	return label.replace(/(^|\s)(\p{Ll})/gu, (match, lead: string, letter: string) => {
		return `${lead}${letter.toUpperCase()}`;
	});
}

/** A column of the file: what it is called, and what it reads from one record. */
export type ExportColumn<TRecord> = {
	/** what the column is called, in the reader's language. */
	header: string;
	/** what it reads from one record, as the kind of thing that is. */
	value: (record: TRecord) => ExportValue;
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
 * What a cell says in a delimited file.
 *
 * The machine form, not the rendered one, and for the same reason the workbook writes a number:
 * a spreadsheet reads `1500` as a number and `2026-01-31` as a date, and reads `﷼ ١٬٥٠٠` as
 * text. A file that is easier for a person to read at a glance and impossible for their
 * spreadsheet to add up is the worse file.
 */
function toDelimitedText(value: ExportValue) {
	if (value === null || value === undefined) {
		return '';
	}

	if (typeof value === 'number') {
		return String(value);
	}

	if (typeof value === 'string') {
		return value;
	}

	return value.kind === 'money' ? String(value.value) : value.value.toISOString().slice(0, 10);
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
export function toCsv<TRecord>(columns: readonly ExportColumn<TRecord>[], records: TRecord[]) {
	const lines = [
		columns.map((column) => toField(toHeading(column.header))),
		...records.map((record) =>
			columns.map((column) => toField(toDelimitedText(column.value(record))))
		)
	];

	return lines.map((fields) => fields.join(',')).join('\r\n');
}

/** One value as the cell the workbook writer is given. */
function toWireCell(value: ExportValue): ExportCell {
	if (value === null || value === undefined || value === '') {
		return { kind: 'empty' };
	}

	if (typeof value === 'number') {
		return { kind: 'number', value };
	}

	if (typeof value === 'string') {
		return { kind: 'text', value };
	}

	return value.kind === 'money'
		? { kind: 'money', value: value.value }
		: { kind: 'date', value: toSerialDay(value.value) };
}

/**
 * The same columns and records as a workbook's one sheet.
 *
 * Nothing is quoted and nothing is defused here. A cell in an archive is not delimited by
 * anything, so quoting would put the quotes themselves in the cell — and the formula guard is
 * the file format's question, answered by the writer that knows which format it is writing.
 * What this owes is the values, as the kinds of thing they are.
 */
export function toExportSheet<TRecord>(
	columns: readonly ExportColumn<TRecord>[],
	records: TRecord[],
	name?: string
): ExportSheet {
	return {
		// a tab name only where the workbook holds more than one sheet. A directory's export is
		// one table and naming its only tab after the file says the file's name twice.
		...(name === undefined ? {} : { name: toSheetName(name) }),
		headers: columns.map((column) => toHeading(column.header)),
		rows: records.map((record) => columns.map((column) => toWireCell(column.value(record))))
	};
}

/** the characters a workbook refuses in a tab name, and the length it refuses beyond. */
const SHEET_NAME_FORBIDDEN = /[[\]:*?/\\]/g;
const SHEET_NAME_LIMIT = 31;

/**
 * A concept's own name, as a tab may be called.
 *
 * The format's rule rather than this application's: a tab may not hold `[]:*?/\` and may not run
 * past thirty-one characters, and a workbook whose sheet breaks either is a file nothing opens.
 * Applied here rather than in the writer because the name is a translated word — the writer
 * would only be able to refuse it, and refusing an export because a language spells a concept
 * long is not an answer anyone can act on.
 */
export function toSheetName(name: string) {
	return name.replace(SHEET_NAME_FORBIDDEN, ' ').trim().slice(0, SHEET_NAME_LIMIT);
}

/**
 * What a file of this format is called, given what the list calls itself.
 *
 * The name the save dialog opens on rather than the name the file ends up with — the reader
 * can type over it, and the format is already decided by the time they see it.
 */
export function toExportFileName(name: string, format: ExportFormat) {
	// the name a list gives already carries `.csv`, from when that was the only format there
	// was. Stripping it keeps the caller's word — the concept's own name for itself — without
	// making every list restate it.
	return `${name.replace(/\.(csv|xlsx)$/i, '')}.${format}`;
}

/**
 * What a file is called, given what it holds and what narrowed it.
 *
 * A file of five thousand tenants and a file of the eleven a search found are both `tenants`
 * otherwise, so the second is offered the first's name and replaces it unless the reader
 * notices. Naming what narrowed it is what keeps two exports two files — and tells a reader who
 * comes back to it a week later that they are not looking at the whole directory.
 */
export function toNarrowedName(name: string, narrowing: readonly string[]) {
	const stated = narrowing.map((part) => part.trim()).filter(Boolean);

	return stated.length > 0 ? `${name} (${stated.join(', ')})` : name;
}

/**
 * Putting a file where the reader asked for it.
 *
 * The three things this module cannot do for itself, handed in by whoever is running it. A
 * consumer backed by a desktop shell answers all three over its own process boundary; a test
 * answers them with a record of what it was asked to write, which is the second adapter that
 * makes this a seam rather than a hole.
 */
export type ExportWriter = {
	/**
	 * Ask the reader where the file goes, answering its path or nothing where they walked away.
	 *
	 * `suggested` is what the dialog opens on rather than what the file ends up called. The reader
	 * can type over it, and {@link toExportFileName} has already put the format's extension on it.
	 */
	chooseFile: (suggested: string) => Promise<string | null>;
	/** Write a delimited file, answering where it landed. */
	writeText: (path: string, contents: string) => Promise<string>;
	/** Write a workbook, answering where it landed. */
	writeWorkbook: (path: string, sheets: ExportSheet[]) => Promise<string>;
};

/** What an export is of: the rows, the columns that read them, and what to call the file. */
export type ExportRequest<TRecord> = {
	/** what the list calls itself, before the format's extension is put on it. */
	name: string;
	/** which of the two the reader chose. */
	format: ExportFormat;
	/** what the file holds, as the concept that renders the rows declares them. */
	columns: readonly ExportColumn<TRecord>[];
	/** the rows to write, in the order the reader is looking at them. */
	records: TRecord[];
};

/**
 * Write an export, answering where it landed, or nothing where the reader walked away.
 *
 * **Walking away from the file dialog is not a failure**: nothing was written and there is
 * nothing to tell anybody, which is why it comes back as `null` rather than as a throw. A
 * refusal from the writer itself does throw, and reporting that is the caller's: this side knows
 * what went wrong and not a single word to say it in.
 *
 * **Which writer rather than which argument**: the two formats differ in what lands on disk
 * rather than in what they are asked for, and a delimited file that a workbook writer produced
 * would carry an archive's framing around text.
 */
export async function writeExport<TRecord>(
	writer: ExportWriter,
	request: ExportRequest<TRecord>
): Promise<string | null> {
	const chosen = await writer.chooseFile(toExportFileName(request.name, request.format));

	if (!chosen) {
		return null;
	}

	return request.format === 'csv'
		? writer.writeText(chosen, toCsv(request.columns, request.records))
		: writer.writeWorkbook(chosen, [toExportSheet(request.columns, request.records)]);
}
