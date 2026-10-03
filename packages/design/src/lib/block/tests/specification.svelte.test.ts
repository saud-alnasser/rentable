import Specification from '#lib/block/specification.svelte';
import UsersIcon from '@lucide/svelte/icons/users';
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

/**
 * A record's fields as label and value, and, where the record states its facts with glyphs as its
 * card does, a glyph leading each label (effort 846, ticket 49: a workspace's page).
 */

test('an entry with a glyph leads its label with it, hidden from assistive technology', () => {
	const { container } = render(Specification, {
		entries: [
			{ label: 'members', value: '2', icon: UsersIcon, hook: 'members' },
			{ label: 'created', value: 'Mar 3, 2026', hook: 'created' }
		]
	});

	const members = container.querySelector('[data-entry="members"]');
	const glyph = members?.querySelector('dt svg');

	expect(glyph?.classList.contains('lucide-users')).toBe(true);
	expect(glyph?.closest('[aria-hidden="true"]')).not.toBeNull();
	expect(members?.querySelector('dd')?.textContent?.trim()).toBe('2');
	// an entry with none draws none.
	expect(container.querySelector('[data-entry="created"] svg')).toBeNull();
});
