// What of the organization only the window can load, which another concept may use: where the
// machine stands, which startup's root and the addresses beside the wall read, whether anybody is
// signed in, which the settings address hands its page, the keys startup refreshes, the first
// workspace's create, the name and mark a printed page carries, and the switcher of the
// organizations this machine holds, which the wall and the no-workspace screen draw at their head
// and which confirms letting go of one, and the locked sentence the no-workspace screen says as the
// shell does. Everything else stays private; `index.ts` holds what loads
// under Node (plan, *A feature has the same two entries*).
export { default as OrganizationLockedNotice } from './component/locked-notice.svelte';
export { default as OrganizationSwitcher } from './component/switcher.svelte';
export {
	keys as organizationKeys,
	useFetchOrganizationState,
	useReadOrganizationMark,
	useReadOrganizationName,
	useSignedIn
} from './query';
export { useCreateWorkspace } from './workspace/query';
