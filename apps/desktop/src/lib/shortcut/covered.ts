/**
 * Whether a form, a sheet or a confirmation stands over the page.
 *
 * Read by every application shortcut that would change what is under the cover: the create key,
 * which would open a second form behind the first, and the undo pair, which would move a change
 * the reader cannot see from where they are. The command palette does not count: it is how those
 * are asked for by name, and it closes as what it runs opens.
 *
 * @param root where to look; the document, unless a test hands it a tree of its own.
 */
export function isCovered(root: ParentNode = document): boolean {
	return Array.from(root.querySelectorAll('[role="dialog"], [role="alertdialog"]')).some(
		(surface) => !surface.querySelector('[data-slot="command"]')
	);
}
