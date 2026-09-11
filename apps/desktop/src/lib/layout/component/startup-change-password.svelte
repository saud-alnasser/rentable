<script lang="ts">
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationChangePasswordForm from '$lib/organization/component/change-password-form.svelte';

	/**
	 * A member who is in on a password somebody else drew.
	 *
	 * An invitation and a reset both hand a person a generated password, and the row they opened
	 * says they have to choose their own before anything else; the shell refuses every other act
	 * for them until they do, and this is the screen saying the same thing before they press
	 * anything. On the application surface and over every address, for the reason the
	 * no-workspace surface is: there is nothing behind it for an address to draw.
	 */
	let {
		organizationName,
		isChanging,
		errorMessage,
		onChange
	}: {
		organizationName: string;
		isChanging: boolean;
		errorMessage: string | null;
		onChange: (current: string, next: string) => void;
	} = $props();
</script>

<StandaloneSurface
	tone="neutral"
	title={$LL.layout.changePassword.title()}
	description={$LL.layout.changePassword.description()}
	busy={isChanging}
>
	<div class="space-y-4 pt-2">
		<p class="text-sm font-medium" data-change-password-organization>{organizationName}</p>

		<OrganizationChangePasswordForm
			currentLabel={$LL.layout.changePassword.handedLabel()}
			{isChanging}
			{errorMessage}
			{onChange}
		/>

		{#if isChanging}
			<p class="text-center text-sm text-muted-foreground">{$LL.layout.signIn.unlocking()}</p>
		{/if}
	</div>
</StandaloneSurface>
