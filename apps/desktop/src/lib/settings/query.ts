import api from '$lib/api/caller';
import { tauri, type RemoteSyncState } from '$lib/platform/tauri';
import {
	announceReceivedRows,
	syncWorkspaceBeforeExit,
	syncWorkspaceNow
} from '$lib/sync/workspace';
import { onMutationError, onMutationSuccess, type MutationOptions } from '$lib/design/mutation';
import { keys as dashboardKeys } from '$lib/dashboard/query';
import { LL } from '$lib/i18n/i18n-svelte';
import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { get } from 'svelte/store';

export const keys = {
	all: ['settings'],
	settings: ['settings', 'data'],
	remoteSync: ['settings', 'remote-sync']
} as const;

export function useFetchSettings() {
	return createQuery(() => ({
		queryKey: keys.settings,
		queryFn: () => api.app.settings.get()
	}));
}

export function useFetchRemoteSyncState() {
	return createQuery(() => ({
		queryKey: keys.remoteSync,
		queryFn: () => api.app.remoteSync.getState()
	}));
}

export function useSetEndingSoonNoticeDays(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.endingSoonUpdated(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: ({ days }: { days: number }) =>
			api.app.settings.set({ endingSoonNoticeDays: days }),
		onSuccess: async (settings) => {
			client.setQueryData(keys.settings, settings);

			await Promise.all([
				client.invalidateQueries({ queryKey: keys.settings }),
				// the prefix, so the screen is refreshed whichever period it is currently showing.
				client.invalidateQueries({ queryKey: dashboardKeys.all })
			]);

			onMutationSuccess(opts);
		},
		onError: (e) => onMutationError(opts, e)
	}));
}

/** ask the updater whether a newer release exists. resolves to `null` when none does. */
export function useCheckForUpdate(opts: MutationOptions = {}) {
	return createMutation(() => ({
		mutationFn: () => tauri.update.check(),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

/** put the workspace in a state an installer may replace the binary from. */
export function usePrepareUpdate(opts: MutationOptions = {}) {
	return createMutation(() => ({
		mutationFn: ({ targetVersion }: { targetVersion: string }) =>
			api.app.update.prepare({ targetVersion }),
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

/**
 * push the workspace to the remote, then restart.
 *
 * the push reads the remote state already in the cache rather than subscribing
 * to it: a caller that only restarts should not hold a live query open for the
 * whole time it is on screen.
 */
export function useRestartApp(opts: MutationOptions = {}) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: async () => {
			await syncWorkspaceBeforeExit(client.getQueryData<RemoteSyncState>(keys.remoteSync));
			await tauri.window.restart();
		},
		onSuccess: () => onMutationSuccess(opts),
		onError: (e: Error) => onMutationError(opts, e)
	}));
}

/**
 * ask whether the workspace and its remote have diverged. resolves to `null`
 * when the workspace is not on a remote that can diverge.
 */
/**
 * reach the control plane and keep this machine replicating.
 *
 * **What a person pressing Sync asks for is both halves**: the window renewed, and this machine's
 * writes offered and the others' taken.
 *
 * *It was `useSyncGoogleDriveWorkspace` and pushed or pulled a whole workspace. Drive sync retired
 * (decision 07), and the note that replaced it read "a replica pushes its own writes, so what a
 * person pressing Sync asks for is the one thing left — the window", which was true of no build:
 * `turso::sync` holds every write until something calls `push`.*
 */
export function useSyncWorkspace(
	opts: MutationOptions = {
		toast: {
			success: () => get(LL).settingsHooks.workspaceUpToDate(),
			error: true,
			unexpected: () => get(LL).common.messages.unexpectedError()
		}
	}
) {
	const client = useQueryClient();

	return createMutation(() => ({
		mutationFn: () => syncWorkspaceNow(),
		onSuccess: async (result) => {
			client.setQueryData(keys.remoteSync, result.state);
			await client.invalidateQueries({ queryKey: keys.remoteSync });

			// The pull brought another device's rows, so this is a writer of workspace data and has
			// to say so. Pressing Sync and being shown the statuses from before the sync is the
			// shape of an unannounced writer.
			if (result.received) {
				await announceReceivedRows(client);
			}

			// The window has closed. It is not a success and it is not a failure — nothing went
			// wrong and nothing was lost — so it is neither of the two toasts but the sentence
			// naming the one thing they can do about it.
			if (result.action === 'signInRequired') {
				toast.error(get(LL).settingsHooks.sessionExpired());
				return;
			}

			onMutationSuccess(opts);
		},
		onError: async (e) => {
			await client.invalidateQueries({ queryKey: keys.remoteSync });
			onMutationError(opts, e);
		}
	}));
}
