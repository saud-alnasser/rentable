import api from '$lib/api/caller';
import { declareMutation } from '$lib/mutation/ui';
import { LL } from '$lib/i18n/i18n-svelte';
import { tauri } from '$lib/organization/tauri';
import { toTauriRefusalReason } from '$lib/error/tauri';
import { createQuery, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';

/**
 * THE ORGANIZATION'S QUERIES
 *
 * The keys every part of the organization reads and invalidates under, and what belongs to the
 * organization as a whole: where this machine stands, the organization's name and mark, the
 * account refusal Turso holds against it, and letting it go. What a member, a role, a grant, a
 * workspace, the reader's own session and the way in read and write is in the sub-concept's own
 * `query.ts` beside this one.
 */

export const keys = {
	all: ['organization'],
	consent: (sessionId: string) => ['organization', 'consent', sessionId],
	machines: ['organization', 'machines'],
	mark: ['organization', 'mark'],
	members: ['organization', 'members'],
	memberStandings: ['organization', 'members', 'standings'],
	roles: ['organization', 'roles'],
	state: ['organization', 'state']
} as const;

/**
 * What every write to the organization's database reads again: the members (their standings sit
 * under them), the roles and where this machine stands, together.
 *
 * **All three, whatever the write named**, because each is drawn from rows the others change and
 * the cards say it at once. A role's holders are counted on the roles, so removing a member moves
 * a role card; a member's workspaces are read off the members, so creating or deleting a workspace
 * moves a member card and the workspace card's count of who holds it; and the workspaces this
 * reader holds, with their names, are part of the state, so renaming one moves its card. A write
 * that named only the key it thought of left the others showing the old row until the section was
 * drawn again, which is how a renamed workspace's card kept its old name until the reader switched
 * tabs away and back (fixed with effort 851). One refresh for every write is the cost of a local
 * read or two; a card one change behind is the cost of naming them one at a time.
 */
export const organizationChanged = { together: [keys.members, keys.roles, keys.state] } as const;

/**
 * the state read again where Turso no longer accepts the organization's consent, for every write
 * that spends it.
 *
 * Rust lets the consent go as it refuses (`turso/platform/live.rs`), so the organization holds no
 * Turso authority any more; reading the state again is what puts the connect card in its settings,
 * the place the refusal's sentence sends the owner, rather than leaving the acts it gated on offer
 * until a relaunch. Any other refusal reads nothing again.
 */
export async function consentLostRereadsTheState(
	{ error }: { error: unknown },
	client: Pick<QueryClient, 'invalidateQueries'>
) {
	if (toTauriRefusalReason(error) !== 'tursoConsentLost') return;

	await client.invalidateQueries({ queryKey: keys.state });
}

/**
 * forget the organization this machine holds: the shell signs out where somebody is in, deletes
 * every replica here, empties the record and clears the Turso authority (requirement 20 of
 * effort 824). Nothing on Turso is touched.
 *
 * **No invalidation here**, because what follows is the wall: the caller hands the outcome to
 * the startup unit, which reads where the machine stands and raises the screen a machine with
 * nothing shows, clearing the whole cache on the way. The one confirm before it runs is the
 * screen's.
 */
export const useDisconnectOrganization = declareMutation({
	mutate: () => api.organization.disconnect(),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.disconnected(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	}
});

/**
 * delete the organization: the shell removes every workspace database and the organization's own
 * directory from the owner's Turso account, then forgets all of it here (effort 828, requirement
 * 18). Nothing puts either back.
 *
 * **No invalidation here**, for the same reason the disconnect has none: what follows is the first
 * screen, and the caller hands the outcome to the startup unit, which reads where the machine
 * stands and clears the whole cache on the way. The one question before it runs is the surface's,
 * and it is where the password is typed.
 */
export const useDeleteOrganization = declareMutation({
	mutate: (input: { password: string }) => api.organization.delete(input),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.dashboard.organizationDeleted(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	failed: consentLostRereadsTheState
});

/**
 * rename the organization, as its owner (effort 851, requirements 22 to 25). The shell answers
 * with the whole state, which is written under the state's key before anything is read again, so
 * the organization tab, the rail and the record the switcher draws from name the new name at
 * once rather than after a round trip.
 */
export const useRenameOrganization = declareMutation({
	mutate: ({ name }: { name: string }) => api.organization.rename({ name }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.name.renamed(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	sets: ({ result }) => [{ key: keys.state, data: result }],
	invalidates: [organizationChanged]
});

/** where this machine stands: the organizations it joined and who is in. */
export function useFetchOrganizationState() {
	return createQuery(() => ({
		queryKey: keys.state,
		queryFn: () => tauri.getState()
	}));
}

/**
 * whether anybody is signed in on this machine, which decides the settings sections offered.
 * Read off the organization's own state, as the settings address always has. *It sat in
 * `$lib/app/wall` until effort 840's ticket 69 gave it to the organization, whose state it reads.*
 */
export function useSignedIn(): { readonly current: boolean } {
	const stateQuery = useFetchOrganizationState();

	return {
		get current() {
			return (stateQuery.data?.session ?? null) !== null;
		}
	};
}

/**
 * Read the organization's name once, for a page that names who issued it: a printed receipt or
 * schedule. Under the key `useFetchOrganizationState` reads, so the rail's own read is reused.
 * Every signed-in member holds it, opened from the replica, offline included.
 */
export function useReadOrganizationName() {
	const client = useQueryClient();

	return async () => {
		const state = await client.fetchQuery({
			queryKey: keys.state,
			queryFn: () => tauri.getState()
		});

		return state.session?.organizationName?.trim() ?? '';
	};
}

/**
 * The organization's mark, a signature or a seal, for the settings that show it. Nothing where
 * none is set.
 */
export function useFetchOrganizationMark() {
	return createQuery(() => ({
		queryKey: keys.mark,
		queryFn: () => api.organization.mark.get()
	}));
}

/** Read the organization's mark once, for a page that prints it at its foot. */
export function useReadOrganizationMark() {
	const client = useQueryClient();

	return () =>
		client.fetchQuery({ queryKey: keys.mark, queryFn: () => api.organization.mark.get() });
}

/**
 * Keep the image at `path` as the organization's mark. The host reads it, checks it by its bytes
 * and seals it; a refusal (too large, not an image, not the reader's to change) is its sentence.
 */
export const useSetOrganizationMark = declareMutation({
	mutate: (path: string) => api.organization.mark.set({ path }),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.mark.saved(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	sets: ({ result }) => [{ key: keys.mark, data: result }]
});

/** Remove the organization's mark; the pages printed after it have none. */
export const useClearOrganizationMark = declareMutation({
	mutate: () => api.organization.mark.clear(),
	touches: 'none',
	toast: {
		success: () => get(LL).organization.mark.removed(),
		error: true,
		unexpected: () => get(LL).common.messages.unexpectedError()
	},
	sets: () => [{ key: keys.mark, data: null }]
});

/**
 * Turso's own sentence about a standing account refusal: the owner's alone, `null` for
 * everybody else, and read only while a refusal stands.
 */
export function useAccountRefusalDetail(refused: () => boolean) {
	return createQuery(() => ({
		queryKey: [...keys.state, 'accountRefusal'],
		queryFn: () => tauri.accountRefusalDetail(),
		enabled: refused()
	}));
}
