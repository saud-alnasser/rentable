import RecordSurface from '#lib/block/record-surface.svelte';
import Specification from '#lib/block/specification.svelte';
import { suppliedStrings } from '#tests/contract-strings.js';
import Providers from '#tests/providers.svelte';
import { render } from '@testing-library/svelte';
import { afterEach, expect, test } from 'vitest';

/**
 * A READER'S WORDS KEEP THEIR OWN ORDER IN THE OTHER DIRECTION
 *
 * Ticket 29 of effort 832, from the walk of ticket 27: on an Arabic screen "Adeline Wiegand Sr."
 * rendered as ".Adeline Wiegand Sr" and "4253 Russel Motorway" as "Russel Motorway 4253", on a
 * record's title and on the lists beneath it. The bidi algorithm lays a run of Latin letters out
 * left to right but hands the neutral at its edge, the period or the number, to the paragraph's
 * direction, which in Arabic puts it at the other end.
 *
 * **What a test can reach, and what it cannot**, which is the reason `design/cell/phone.svelte`'s
 * test gives in the application: jsdom lays nothing out, so the order the glyphs land in is not
 * observable. The mechanism is: the value sits in an isolate of its own under an ancestor that is
 * `rtl`, and an isolate is the whole of what keeps its neutrals at its own ends. The isolate is a
 * `<bdi>`, which is `dir="auto"` and `unicode-bidi: isolate` by definition, and it is inline, so the
 * line still aligns to the reader's start edge.
 */

const NAME = 'Adeline Wiegand Sr.';
const ADDRESS = '4253 Russel Motorway';

/** the element holding exactly `text`, and the isolate around it if there is one. */
function isolateOf(text: string) {
	const holder = [...document.querySelectorAll('bdi')].find((node) => node.textContent === text);

	return holder ?? null;
}

afterEach(() => {
	document.body.dir = '';
});

test('a record names itself, and its eyebrow, each in an isolate of its own under rtl', () => {
	document.body.dir = 'rtl';

	render(
		RecordSurface,
		{
			isLoading: false,
			found: true,
			backFallback: '/complexes',
			path: '/complexes/1',
			eyebrow: ADDRESS,
			title: NAME
		},
		{
			wrapper: Providers,
			wrapperProps: { strings: suppliedStrings(), direction: 'rtl' }
		}
	);

	const title = isolateOf(NAME);
	const eyebrow = isolateOf(ADDRESS);

	expect(title?.closest('h1')).not.toBeNull();
	expect(eyebrow).not.toBeNull();
	// the isolate is the value and nothing more, so no word of the reader's language runs inside it.
	expect(title?.parentElement?.textContent).toBe(NAME);
	expect(document.body.dir).toBe('rtl');
});

test('a field given as text is isolated, so an address keeps its number at the front', () => {
	document.body.dir = 'rtl';

	render(Specification, {
		entries: [
			{ label: 'العنوان', value: ADDRESS },
			{ label: 'المستأجر', value: NAME }
		]
	});

	expect(isolateOf(ADDRESS)?.closest('dd')).not.toBeNull();
	expect(isolateOf(NAME)?.closest('dd')).not.toBeNull();
	// the label is the reader's own word, in the reader's direction, and is not isolated.
	expect(isolateOf('العنوان')).toBeNull();
});
