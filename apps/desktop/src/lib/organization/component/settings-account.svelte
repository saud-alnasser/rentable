<script lang="ts">
	import type { SettingsSectionProps } from '$lib/feature/surface';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Separator } from '@rentable/design/primitive/separator/index.js';
	import { toErrorText } from '$lib/error/message';
	import { LL } from '$lib/i18n/i18n-svelte';
	import OrganizationAcceptOwnership from '$lib/organization/member/component/accept-ownership.svelte';
	import OrganizationChangePasswordDialog from '$lib/organization/session/component/change-password-dialog.svelte';
	import OrganizationEndOtherSessions from '$lib/organization/session/component/end-other-sessions.svelte';
	import OrganizationIdentity from '$lib/organization/session/component/identity.svelte';
	import { useAcceptOwnership } from '$lib/organization/member/query';
	import { useChangePassword, useEndOtherSessions } from '$lib/organization/session/query';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';

	/**
	 * The settings area's account section: what a person reads about themselves, and the one
	 * offer that may be waiting on them. The organization contributes it (`surface.ts`), and the
	 * area draws it while somebody is signed in.
	 *
	 * **What it reads and writes is its own**, the way a record's section reads its records: the
	 * session, the password change, the acceptance and signing out of the other machines. *The
	 * settings route read them and handed the area a callback per act until effort 840, when the
	 * area stopped naming the organization.*
	 *
	 * **What the section is about, then what it holds.** *Settled by the human on the real
	 * organization.* It opens with the offer where one stands, because it is the one block here
	 * waiting on a reply.
	 */
	// what the area hands every section it draws. Nothing this section does lets go of the
	// organization, so it reads none of it; declared so the section is typed as one.
	// eslint-disable-next-line no-empty-pattern
	let {}: SettingsSectionProps = $props();

	const stateQuery = useFetchOrganizationState();
	const session = $derived(stateQuery.data?.session ?? null);

	const changePasswordMutation = useChangePassword();
	const acceptOwnershipMutation = useAcceptOwnership();
	const endOtherSessions = useEndOtherSessions();

	let changingPassword = $state(false);
	/** what the shell refused the last change with, marked on the dialog's current-password field. */
	let passwordRefusal = $state<string | null>(null);

	/**
	 * the reader's own password, changed from this section.
	 *
	 * A change that went through closes the surface, which empties it: the two values on it are
	 * the ones that must not be left on screen. A refusal keeps it open with what was typed, and
	 * the sentence the shared handler already said in a toast is put back on the field it belongs
	 * to, because the current password is what the shell refuses this with
	 * ([[rules/interface]], *Validation errors*).
	 */
	const changePassword = async (current: string, next: string) => {
		passwordRefusal = null;

		try {
			await changePasswordMutation.mutateAsync({ current, next });
			changingPassword = false;
		} catch (error) {
			passwordRefusal = toErrorText(error, $LL);
		}
	};

	let acceptingOwnership = $state(false);
	/** what the shell refused the last acceptance with, marked on its password field. */
	let acceptRefusal = $state<string | null>(null);

	/**
	 * the organization, accepted from this section.
	 *
	 * The same shape again. The state is read again after it, because the reader's own role
	 * changed: they are the owner now, and the sections the area offers, the acts the cards carry
	 * and the rail's menus are all drawn off that. The surface closes because the offer it was
	 * drawn for is spent.
	 */
	const acceptOwnership = async (password: string) => {
		acceptRefusal = null;

		try {
			await acceptOwnershipMutation.mutateAsync({ password });
			await stateQuery.refetch();
			acceptingOwnership = false;
		} catch (error) {
			acceptRefusal = toErrorText(error, $LL);
		}
	};
</script>

{#if session}
	<Field.Group>
		<!-- the offer first, and only where one stands: it is the one thing in this section
		     waiting on the reader, and everything under it is a fact about their account that
		     will read the same tomorrow (requirement 22). *It stood last while it was the block
		     most often absent; the human read the four sections and asked for what is waiting to
		     come first.* -->
		{#if session.ownershipOffered}
			<Field.Set>
				<Field.Legend>{$LL.settings.you.ownership.title()}</Field.Legend>
				<Field.Field orientation="vertical" data-ownership-offer>
					<Field.Content>
						<Field.Description>
							{$LL.settings.you.ownership.offered({ owner: session.ownerUsername })}
						</Field.Description>
					</Field.Content>

					<div>
						<Button
							type="button"
							variant="outline"
							data-accept-ownership-open
							onclick={() => {
								acceptRefusal = null;
								acceptingOwnership = true;
							}}
						>
							<CrownIcon class="size-4" />
							{$LL.organization.dashboard.acceptOwnership()}
						</Button>
					</div>
				</Field.Field>
			</Field.Set>

			<Separator />
		{/if}

		<!-- then who this reader is, then the one thing they change about themselves, then the
		     machines they left signed in: the section is about them, so it opens with them. -->
		<Field.Set>
			<Field.Legend>{$LL.settings.you.signedInAs()}</Field.Legend>
			<OrganizationIdentity {session} />
		</Field.Set>

		<Separator />

		<Field.Set>
			<Field.Legend>{$LL.settings.you.password.title()}</Field.Legend>
			<!-- the fact, and the control that opens the write: nothing about the password is
			     drawn until the person asks to change it (requirement 8). -->
			<Field.Field orientation="vertical" data-password>
				<Field.Content>
					<Field.Description>{$LL.settings.you.password.description()}</Field.Description>
				</Field.Content>

				<div>
					<!-- the verb's glyph before its label; outline rather than solid, since the act is
					     offered and never invited. -->
					<Button
						type="button"
						variant="outline"
						data-change-password-open
						onclick={() => {
							passwordRefusal = null;
							changingPassword = true;
						}}
					>
						<KeyRoundIcon class="size-4" />
						{$LL.settings.you.password.change()}
					</Button>
				</div>
			</Field.Field>
		</Field.Set>

		<Separator />

		<Field.Set>
			<Field.Legend>{$LL.settings.you.sessions.title()}</Field.Legend>
			<OrganizationEndOtherSessions
				organizationName={session.organizationName}
				onEndOtherSessions={async () => {
					await endOtherSessions.mutateAsync();
				}}
			/>
		</Field.Set>
	</Field.Group>

	<OrganizationChangePasswordDialog
		open={changingPassword}
		onOpenChange={(open) => {
			changingPassword = open;

			if (!open) passwordRefusal = null;
		}}
		currentLabel={$LL.settings.you.password.currentLabel()}
		isChanging={changePasswordMutation.isPending}
		errorMessage={passwordRefusal}
		onChange={(current, next) => void changePassword(current, next)}
	/>

	<OrganizationAcceptOwnership
		open={acceptingOwnership}
		onOpenChange={(open) => {
			acceptingOwnership = open;

			if (!open) acceptRefusal = null;
		}}
		organizationName={session.organizationName}
		ownerUsername={session.ownerUsername}
		isAccepting={acceptOwnershipMutation.isPending}
		errorMessage={acceptRefusal}
		onAccept={(password) => void acceptOwnership(password)}
	/>
{/if}
