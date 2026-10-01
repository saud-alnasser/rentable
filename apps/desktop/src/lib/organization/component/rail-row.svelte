<script lang="ts">
	import { useFetchOrganizationState } from '$lib/organization/query';
	import OrganizationAccountMenu from '$lib/organization/session/component/account-menu.svelte';

	/**
	 * The account's row at the foot of the rail, which the shell draws at its `account-menu` place:
	 * who is signed in and their menu. It reads who is in for itself, and the shell hands it nothing.
	 *
	 * **It carries no loading state.** The rail draws it signed in only past admission, so an
	 * account is held whenever the menu is drawn.
	 */
	const organizationQuery = useFetchOrganizationState();

	const session = $derived(organizationQuery.data?.session ?? null);
</script>

{#if session}
	<OrganizationAccountMenu {session} />
{/if}
