// Shared fixtures for the transfer capability's port. Not a `*.test.ts` file, so the test runner
// does not pick it up directly. `app/tests/host.ts` composes the port into the whole `Host`; the
// file a workspace crosses as is `./file.ts`.

import { refuse } from '$lib/platform/tests/testing.ts';
import type { TransferHost } from '$lib/transfer/host.ts';

/** The transfer port with every member refusing by name, as `fakeHost` hands it over. */
export function fakeTransferHost(): TransferHost {
	return {
		export: {
			write: refuse('transfer.export.write'),
			writeWorkbook: refuse('transfer.export.writeWorkbook')
		},
		import: {
			read: refuse('transfer.import.read'),
			readBook: refuse('transfer.import.readBook')
		}
	};
}
