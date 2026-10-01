import api from '$lib/api/caller';
import { recordDiagnosticWarning } from '$lib/platform/diagnostics';
import type { EarlierRead, EarlierRecords } from '$lib/workspace/host';
import { tauri } from '$lib/workspace/tauri';
import { settingsKeys } from '$lib/settings';
import { createQuery, useQueryClient, type QueryClient } from '@tanstack/svelte-query';

/**
 * THE EARLIER RECORDS
 *
 * What 0.12.0 and 0.13.0 left in this machine's `app.db`, and whether it is still on offer here
 * (effort 838, requirement 18). The way in says so in one line and the settings area's workspace
 * group offers to bring them in; both read the offer from here, so the two go together once the
 * records are brought in or dismissed.
 *
 * Apart from `query.ts`, where settling the offer is declared, because the way in reads the
 * offer and this read loads without the mutation capability behind that declaration.
 *
 * Named for the file it reads, which `tauri/src/upgrade/record.rs` reads for it; it was
 * `earlier.ts` until effort 840 (ticket 48).
 */

/**
 * The key of what this machine's `app.db` holds from an earlier version.
 *
 * Outside the workspace prefixes on purpose: the file is 0.12.0's or 0.13.0's and nothing this
 * build writes changes it, so no workspace write has a reason to ask again.
 */
export const earlierKeys = {
	found: ['earlier-records']
} as const;

/**
 * Whether this machine's `app.db` holds the records of 0.12.0 or 0.13.0, and which.
 *
 * A file that cannot be read is treated as holding none: the way in is no place to report a
 * damaged file from a release this build does not run, and the person has nothing to act on.
 * It is written to the diagnostics so whoever is asked about it later can see it.
 */
export async function findEarlierRecords(): Promise<EarlierRecords | null> {
	try {
		return await tauri.earlier.find();
	} catch (failure) {
		recordDiagnosticWarning('earlier.unreadable', {
			reason: failure instanceof Error ? failure.message : String(failure)
		});

		return null;
	}
}

/**
 * Read those records as the whole-workspace export, and write them as its workbook under
 * `backups/app/`: what the organization's workspaces section brings in through the workspace
 * import, reviewed first. The host's own read, reached here because the section drawing the offer
 * is the organization's and the host adapter is this feature's.
 */
export function readEarlierRecords(): Promise<EarlierRead> {
	return tauri.earlier.read();
}

/**
 * The earlier records still on offer on this machine: found in `app.db`, and neither brought in
 * nor put aside yet (effort 838, requirement 18). `null` while either answer is on its way, and
 * where there is nothing to offer.
 *
 * @param queryClient the client to read through, for a caller outside the provider: the root
 * layout draws the way in beside the provider it creates, as `useCreateWorkspace` is handed it.
 */
export function useEarlierRecords(queryClient?: QueryClient) {
	const client = queryClient ?? useQueryClient();

	const found = createQuery(
		() => ({
			queryKey: earlierKeys.found,
			queryFn: findEarlierRecords,
			// asked once a run: the file is an earlier release's and nothing here writes to it.
			staleTime: Infinity
		}),
		() => client
	);
	const settings = createQuery(
		() => ({
			queryKey: settingsKeys.settings,
			queryFn: () => api.settings.get()
		}),
		() => client
	);

	return {
		get offered(): EarlierRecords | null {
			if (!settings.data || settings.data.earlierRecordsSettled) return null;

			return found.data ?? null;
		}
	};
}
