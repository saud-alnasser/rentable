<script lang="ts">
	import type { ShellSlotProps } from '$lib/feature/surface';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import OrganizationAccountMenu from '$lib/organization/component/account-menu.svelte';
	import OrganizationAccountSignedOut from '$lib/organization/component/account-signed-out.svelte';

	/**
	 * The account's row at the foot of the rail, which the shell draws at its `account-menu` place:
	 * who is signed in and their menu, or, with nobody signed in, the same row as the way in.
	 *
	 * **It reads who is in, and the shell hands it only the frame's part**: which state the rail is
	 * in, and the way in, which navigates and so is the shell's.
	 *
	 * **It carries no loading state.** The rail draws it signed in only past admission, so an
	 * account is held whenever the menu is drawn.
	 */
	let { signedOut, onWayIn }: ShellSlotProps['account-menu'] = $props();

	const organizationQuery = useFetchOrganizationState();

	const session = $derived(organizationQuery.data?.session ?? null);
</script>

{#if signedOut}
	<OrganizationAccountSignedOut {onWayIn} />
{:else if session}
	<OrganizationAccountMenu {session} />
{/if}
