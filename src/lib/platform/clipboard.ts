/**
 * CLIPBOARD
 *
 * putting text where the rest of the machine can reach it. The webview owns the clipboard, so
 * this crosses no process boundary — but it can be refused, which is why it answers rather
 * than throwing: a caller has to say something either way.
 */

/** One stated detail of a record, as it is put on the clipboard. */
export type ClipboardDetail = {
	label: string;
	value: string;
};

/**
 * A record's stated details as lines of `label: value`, in the order the surface reads them.
 *
 * Details with nothing in them are left out rather than written as an empty line: a record
 * that has no government id should not paste a blank one — which is also why this can come
 * back empty, and why the caller has to say so.
 */
export function toDetailLines(details: ClipboardDetail[]): string {
	return details
		.filter((detail) => detail.value.trim())
		.map((detail) => `${detail.label}: ${detail.value}`)
		.join('\n');
}

/**
 * Put a record's stated details where the rest of the machine can reach them.
 *
 * @returns whether anything was written — a refusal and nothing worth writing are the same
 * answer to the caller, which is that the user has to be told it did not happen.
 */
export async function writeDetailsToClipboard(details: ClipboardDetail[]): Promise<boolean> {
	const text = toDetailLines(details);

	if (!text) {
		return false;
	}

	try {
		await navigator.clipboard.writeText(text);

		return true;
	} catch {
		return false;
	}
}
