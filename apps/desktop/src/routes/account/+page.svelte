<script lang="ts">
	import PageFrame from '@rentable/design/block/page-frame.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import OrganizationChangePasswordForm from '$lib/organization/component/change-password-form.svelte';
	import OrganizationIdentity from '$lib/organization/component/identity.svelte';
	import { useChangePassword, useFetchOrganizationState } from '$lib/organization/query';

	/**
	 * The person, as a page of its own.
	 *
	 * **Two groups: who is in, and the password that opens their place.** The username, the
	 * role and the organization are the member's own row, opened with the content key their
	 * vault holds, and the one thing here to change is the password that seals that vault. It is
	 * a page rather than a row on the settings page because it answers a different question, and
	 * because the account control in the sidebar needed somewhere to send a reader that was not
	 * the application's preferences. *It drew the Google account until the control plane retired.*
	 *
	 * No loading branch: the shell renders past admission, and the startup path holds the
	 * organization state before it mounts. See `/workspace` for the same note at length.
	 */
	const organizationQuery = useFetchOrganizationState();
	const changePassword = useChangePassword();

	const session = $derived(organizationQuery.data?.session ?? null);

	let form = $state<{ reset: () => void } | null>(null);

	/**
	 * the one thing about a person this application does hold, changed here. The refusal a person
	 * can act on is said by the shared handler; a change that went through empties the form,
	 * because the two values in it are the ones that must not be left on screen.
	 */
	const change = async (current: string, next: string) => {
		try {
			await changePassword.mutateAsync({ current, next });
			form?.reset();
		} catch {
			// said by the shared handler; the form keeps what was typed.
		}
	};
</script>

{#if session}
	<PageFrame>
		<h1 class="text-3xl font-semibold tracking-tight capitalize">{$LL.account.title()}</h1>

		<Field.Group>
			<Field.Set>
				<Field.Legend>{$LL.account.groupIdentity()}</Field.Legend>
				<OrganizationIdentity {session} />
			</Field.Set>

			<Separator />

			<Field.Set>
				<Field.Legend>{$LL.account.password.title()}</Field.Legend>
				<Field.Description>{$LL.account.password.description()}</Field.Description>
				<OrganizationChangePasswordForm
					bind:this={form}
					currentLabel={$LL.account.password.currentLabel()}
					isChanging={changePassword.isPending}
					errorMessage={null}
					onChange={(current, next) => void change(current, next)}
				/>
			</Field.Set>
		</Field.Group>
	</PageFrame>
{/if}
