// Shared fixtures for the workspace's port. Not a `*.test.ts` file, so the test runner does not
// pick it up directly. `app/tests/host.ts` composes the port into the whole `Host`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { WorkspaceHost } from '$lib/workspace/host.ts';

/** The workspace's port with every member refusing by name, as `fakeHost` hands it over. */
export function fakeWorkspaceHost(): WorkspaceHost {
	return {
		earlier: {
			find: refuse('workspace.earlier.find'),
			read: refuse('workspace.earlier.read')
		}
	};
}
