import assert from 'node:assert/strict';
import test from 'node:test';

import { accountInitials } from '$lib/sync/account';

/**
 * REQUIREMENT 24, IN LETTERS
 *
 * The avatar shows the first two characters of the username, upper-cased. A username is one
 * word (`invite::validate_username` admits no space), so there is no second word to take a
 * letter from, and the pair is read off the front of the one word instead. A string shorter
 * than two is padded rather than thrown on, because the avatar draws a disc of a fixed size
 * either way; a valid username is at least three, so the padding is defensive.
 */

test('the first two characters of the username, upper-cased', () => {
	assert.equal(accountInitials('olivia'), 'OL');
	assert.equal(accountInitials('ada.lovelace'), 'AD');
	assert.equal(accountInitials('sami_99'), 'SA');
	assert.equal(accountInitials('Zoe'), 'ZO');
});

// two words used to give two initials; a username has no second word, and a string that does
// reads from its front like any other.
test('two words are not two initials', () => {
	assert.equal(accountInitials('ada lovelace'), 'AD');
	assert.equal(accountInitials('  padded  '), 'PA');
});

test('a string shorter than two is padded with the fallback rather than thrown on', () => {
	assert.equal(accountInitials('a'), 'A?');
	assert.equal(accountInitials(''), '??');
	assert.equal(accountInitials(null), '??');
	assert.equal(accountInitials(undefined), '??');
	assert.equal(accountInitials('a', '-'), 'A-');
});
