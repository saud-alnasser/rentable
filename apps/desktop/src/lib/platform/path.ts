/**
 * PATH
 *
 * what a file's name is made of, on the two shapes of path this application meets.
 *
 * Nothing here reads or writes anything: a path that arrives from a dialog is text until Rust
 * is handed it, and these are the questions the web layer asks of that text.
 */

/** the separator on either platform. Windows accepts both, so both are separators here. */
const SEPARATORS = /[\\/]/;

/**
 * The chosen path, carrying `extension` whether or not the reader left it on.
 *
 * The save dialog is asked for one and offers a name that already has it, and on Windows the
 * common dialog puts it back by itself — but the reader can still type a name without one, and
 * the GTK dialog hands that straight back. An extension is not what makes a file its format
 * here: which command wrote it is, so a workbook named `tenants` is a workbook, and it is one
 * that nothing on the reader's machine will open by being clicked.
 *
 * Only the file's own name is looked at. A folder called `Q1.2026` is not an extension, and a
 * path ending in one is a path with no name yet.
 */
export function withExtension(path: string, extension: string) {
	if (!extension) {
		return path;
	}

	const name = path.split(SEPARATORS).pop() ?? '';
	const carriesIt = name.toLowerCase().endsWith(`.${extension.toLowerCase()}`);

	return carriesIt ? path : `${path}.${extension}`;
}
