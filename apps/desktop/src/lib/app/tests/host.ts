// The composed fake host every router and context test hands a context: each port's own fake,
// bound under its name the way `app/host.ts` binds each port's Tauri adapter. Not a `*.test.ts`
// file, so the test runner does not pick it up directly.

import type { Host } from '$lib/app/host.ts';
import { fakeOrganizationHost } from '$lib/organization/tests/testing.ts';
import { fakePlatformHost } from '$lib/platform/tests/testing.ts';
import { fakePrintHost } from '$lib/print/tests/testing.ts';
import { fakeSettingsHost } from '$lib/settings/tests/testing.ts';
import { fakeStartupHost } from '$lib/startup/tests/testing.ts';
import { fakeSyncHost } from '$lib/sync/tests/testing.ts';
import { fakeTransferHost } from '$lib/transfer/tests/testing.ts';
import { fakeUpdateHost } from '$lib/update/tests/testing.ts';
import { fakeWorkspaceHost } from '$lib/workspace/tests/testing.ts';

/**
 * A host implementing the whole port, so a fixture satisfies the interface a subject is handed
 * rather than the corner of it that subject happens to read. Every capability a test does not
 * supply refuses by name.
 *
 * `overrides` replaces a capability whole, never a member of one: a half-supplied `settings` is
 * the same hole this exists to close.
 */
export function fakeHost(overrides: Partial<Host> = {}): Host {
	return {
		...fakePlatformHost(),
		organization: fakeOrganizationHost(),
		print: fakePrintHost(),
		settings: fakeSettingsHost(),
		startup: fakeStartupHost(),
		sync: fakeSyncHost(),
		transfer: fakeTransferHost(),
		update: fakeUpdateHost(),
		workspace: fakeWorkspaceHost(),
		...overrides
	};
}
