<script lang="ts">
	import type { JoinStep } from '$lib/organization/join';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LockOpenIcon from '@lucide/svelte/icons/lock-open';

	/**
	 * The join screen: an invitation, opened.
	 *
	 * **One screen for both ways a link arrives.** The operating system hands a `rentable://` link
	 * to the running application and the screen opens with it already read; a person whose
	 * platform did not hand it over pastes it into the field. From there the shape is the sign-in
	 * card's: the organization by name, one password field, and the way in.
	 *
	 * **A refused invitation still names the organization** (requirement 23): the link found it,
	 * and what is refused is the invitation, so the screen says which of the three it is and whom
	 * to ask. The reasons are sentences of this locale and never the shell's prose, because the
	 * standing crosses as a word the screen can translate.
	 *
	 * **The organization's own link restores a place** (requirement 6). A link with no invitation
	 * in it is what the first run produced; on a machine that has joined nothing it asks for the
	 * email, where the person was invited with one, and the password, and the vault opens as it
	 * would on the machine that made it. An owner typed no address at the first run and leaves
	 * it empty.
	 *
	 * On the application surface rather than in the frame, because it is drawn with nobody signed
	 * in, which `layout/shell-surface.ts` allows for this one address and the first run's.
	 */
	let {
		step,
		isJoining,
		errorMessage,
		onOpenLink,
		onJoin,
		onRestore,
		onPasteAnother,
		onSignInInstead
	}: {
		step: JoinStep;
		/** the password is being tried, which is a key derivation the person is waiting on. */
		isJoining: boolean;
		/** what the last join said, where it refused. */
		errorMessage: string | null;
		onOpenLink: (link: string) => void;
		onJoin: (link: string, password: string) => void;
		onRestore: (link: string, email: string, password: string) => void;
		onPasteAnother: () => void;
		onSignInInstead: () => void;
	} = $props();

	let pasted = $state('');
	let password = $state('');
	let email = $state('');

	const busy = $derived(step.kind === 'inspecting' || isJoining);
	const canOpen = $derived(pasted.trim().length > 0 && !busy);
	const canJoin = $derived(step.kind === 'password' && password.length > 0 && !busy);
	const canRestore = $derived(step.kind === 'restore' && password.length > 0 && !busy);

	const refusal = $derived.by(() => {
		if (step.kind !== 'refused') return null;

		return {
			lapsed: $LL.organization.join.refusedLapsed(),
			consumed: $LL.organization.join.refusedConsumed(),
			revoked: $LL.organization.join.refusedRevoked(),
			none: null,
			open: null
		}[step.facts.standing];
	});
</script>

<StandaloneSurface
	tone="neutral"
	title={$LL.organization.join.title()}
	description={$LL.organization.join.description()}
	{busy}
>
	<div class="space-y-4 pt-2" data-join-step={step.kind}>
		{#if step.kind === 'paste' || step.kind === 'unreadable'}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canOpen) onOpenLink(pasted);
				}}
			>
				{#if step.kind === 'unreadable'}
					<Callout tone="error">{$LL.organization.join.unreadable()}</Callout>
				{/if}

				<Field.Field>
					<Field.Label for="join-link">{$LL.organization.join.linkLabel()}</Field.Label>
					<!-- a machine string, typed left to right in both locales ([[rules/frontend]], *i18n*). -->
					<Input
						id="join-link"
						name="link"
						dir="ltr"
						autocomplete="off"
						spellcheck={false}
						bind:value={pasted}
						disabled={busy}
					/>
				</Field.Field>

				<Button type="submit" class="w-full justify-center" disabled={!canOpen}>
					{$LL.organization.join.open()}
				</Button>
			</form>
		{:else if step.kind === 'inspecting'}
			<p class="text-center text-sm text-muted-foreground">{$LL.organization.join.reading()}</p>
		{:else if step.kind === 'unreachable'}
			<Callout tone="error">{$LL.organization.join.unreachable()}</Callout>
			<p class="text-sm text-muted-foreground" data-join-detail>{step.message}</p>
			<Button class="w-full justify-center" onclick={() => onOpenLink(step.link)}>
				{$LL.organization.join.tryAgain()}
			</Button>
			<Button variant="link" class="w-full justify-center" onclick={onPasteAnother}>
				{$LL.organization.join.pasteAnother()}
			</Button>
		{:else if step.kind === 'refused'}
			<p class="text-sm" data-join-organization={step.facts.organizationId}>
				{$LL.organization.join.found({ name: step.facts.organizationName })}
			</p>
			<Callout tone="warning">{refusal}</Callout>
			{#if step.facts.standing === 'consumed'}
				<Button class="w-full justify-center" onclick={onSignInInstead}>
					{$LL.organization.join.signInInstead()}
				</Button>
			{/if}
			<Button variant="link" class="w-full justify-center" onclick={onPasteAnother}>
				{$LL.organization.join.pasteAnother()}
			</Button>
		{:else if step.kind === 'password'}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canJoin) onJoin(step.link, password);
				}}
			>
				<p class="text-sm" data-join-organization={step.facts.organizationId}>
					{$LL.organization.join.found({ name: step.facts.organizationName })}
				</p>

				{#if errorMessage}
					<Callout tone="error">{errorMessage}</Callout>
				{/if}

				<Field.Field>
					<Field.Label for="join-password">{$LL.organization.join.passwordLabel()}</Field.Label>
					<Input
						id="join-password"
						name="password"
						type="password"
						autocomplete="off"
						bind:value={password}
						disabled={busy}
					/>
				</Field.Field>

				<Button type="submit" class="w-full justify-center" disabled={!canJoin}>
					<LockOpenIcon class="size-4" />
					{isJoining ? $LL.common.actions.working() : $LL.organization.join.join()}
				</Button>
			</form>

			{#if isJoining}
				<p class="text-center text-sm text-muted-foreground">{$LL.layout.signIn.unlocking()}</p>
			{/if}

			<Button variant="link" class="w-full justify-center" onclick={onPasteAnother} disabled={busy}>
				{$LL.organization.join.pasteAnother()}
			</Button>
		{:else if step.kind === 'restore'}
			<form
				class="space-y-4"
				data-join-restore
				onsubmit={(event) => {
					event.preventDefault();

					if (canRestore) onRestore(step.link, email, password);
				}}
			>
				<p class="text-sm" data-join-organization={step.facts.organizationId}>
					{$LL.organization.join.found({ name: step.facts.organizationName })}
				</p>
				<p class="text-sm text-muted-foreground">{$LL.organization.join.restoreDescription()}</p>

				{#if errorMessage}
					<Callout tone="error">{errorMessage}</Callout>
				{/if}

				<Field.Field>
					<Field.Label for="restore-email">{$LL.organization.join.emailLabel()}</Field.Label>
					<Input
						id="restore-email"
						name="email"
						type="email"
						autocomplete="off"
						bind:value={email}
						disabled={busy}
					/>
					<Field.Description>{$LL.organization.join.emailOptional()}</Field.Description>
				</Field.Field>

				<Field.Field>
					<Field.Label for="restore-password">{$LL.layout.signIn.password()}</Field.Label>
					<Input
						id="restore-password"
						name="password"
						type="password"
						autocomplete="current-password"
						bind:value={password}
						disabled={busy}
					/>
				</Field.Field>

				<Button type="submit" class="w-full justify-center" disabled={!canRestore}>
					<LockOpenIcon class="size-4" />
					{isJoining ? $LL.common.actions.working() : $LL.organization.join.restore()}
				</Button>
			</form>

			{#if isJoining}
				<p class="text-center text-sm text-muted-foreground">{$LL.layout.signIn.unlocking()}</p>
			{/if}

			<Button variant="link" class="w-full justify-center" onclick={onPasteAnother} disabled={busy}>
				{$LL.organization.join.pasteAnother()}
			</Button>
		{/if}
	</div>
</StandaloneSurface>
