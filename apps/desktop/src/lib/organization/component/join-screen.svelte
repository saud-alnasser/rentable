<script lang="ts">
	import { CODE_LENGTH, normalizeCode, type JoinStep } from '$lib/organization/join';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import SurfaceAction from '@rentable/design/block/surface-action.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { PASSWORD_FLOOR } from '$lib/organization/setup';
	import BackGlyph from './back-glyph.svelte';
	import HashIcon from '@lucide/svelte/icons/hash';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import LinkIcon from '@lucide/svelte/icons/link';
	import LogInIcon from '@lucide/svelte/icons/log-in';
	import PlugIcon from '@lucide/svelte/icons/plug';

	/**
	 * The connect screen: either link, read and recorded, and what each of the two leads to.
	 *
	 * **One screen for both ways a link arrives.** The operating system hands a `rentable://` link
	 * to the running application and the screen opens with it already being read; a person whose
	 * platform did not hand it over pastes it into the field. The field is one field and it takes
	 * both kinds of link (effort 826, requirement 10): which kind it is, is read from the link
	 * rather than asked.
	 *
	 * **An organization link ends this screen and an invitation link finishes on it.** The first
	 * names the organization and admits nobody, so the machine records it and the person stands at
	 * the wall, which is the shell's and not drawn here. The second carries the half that opens one
	 * member's vault, so the screen names the organization and the person, takes the password they
	 * are choosing, and the accept signs them in. *A link carried no invitation half between effort
	 * 824 and this one, and this screen asked for no password.*
	 *
	 * **A link that admits nobody is refused by name, on a machine that is already connected.** A
	 * lapsed or a revoked invitation says to ask whoever invited for a new link, which is Rust's
	 * own sentence; a link for another organization says to disconnect first. A link already opened
	 * is the ordinary way a person sets up a second machine, since a member signs in on as many
	 * machines as they like and the invitation is spent on the first: it says so and offers the
	 * wall, where the password they chose is what admits them.
	 *
	 * **Every step can be left from the card's corner, and only from there.** The surface's
	 * `corner` slot is where a reader looks for the way past a screen, and the one control in it
	 * fires `onBack`; where that leads is the route's to decide, since the screen does not know
	 * whether the step before it was the wall or the field.
	 *
	 * **The field's glyph is its subject and never its error, and a primary carries its verb.** The
	 * leading addon is muted so it does not outweigh the label beside it (*Balance weight and
	 * contrast*, Refactoring UI p.56); a refusal is still said in a callout above the form, and a
	 * field the person can fix marks its own line, which is the interface rule's treatment.
	 *
	 * **The password is two fields and no meter**, the shape `change-password-form.svelte` carries
	 * and for the reason written there: there is no server to slow a guess down, so the floor is
	 * said as a sentence and the confirmation is what catches a typo.
	 *
	 * On the application surface rather than in the frame, because it is drawn with nobody signed
	 * in, which `layout/shell-surface.ts` allows for this one address and the first run's.
	 */
	let {
		step,
		onConnect,
		onJoin,
		onSignIn,
		onBack
	}: {
		step: JoinStep;
		/** a link to read and record; the route runs the inspect and the connect on it. */
		onConnect: (link: string) => void;
		/**
		 * the code the issuer read out and the password chosen on an invitation that stands; the
		 * route runs the accept, which opens the vault with the link's secret and the code
		 * together (effort 826, requirement 23).
		 */
		onJoin: (link: string, code: string, password: string) => void;
		/** the wall, offered on a link that was already opened: the machine is connected. */
		onSignIn: () => void;
		/** the corner control, on every step; the route decides where each step goes back to. */
		onBack: () => void;
	} = $props();

	let pasted = $state('');
	let code = $state('');
	let password = $state('');
	let confirmation = $state('');

	const isJoining = $derived(step.kind === 'password' && step.isJoining);
	const busy = $derived(step.kind === 'inspecting' || isJoining);
	const canConnect = $derived(pasted.trim().length > 0 && !busy);
	const tooShort = $derived(password.length > 0 && password.length < PASSWORD_FLOOR);
	const mismatch = $derived(confirmation.length > 0 && confirmation !== password);
	const canJoin = $derived(
		code.length === CODE_LENGTH &&
			password.length >= PASSWORD_FLOOR &&
			confirmation === password &&
			!isJoining
	);

	// the code as the person types it: upper-cased, and the spaces and hyphens somebody reading
	// one out puts in taken off, so what was said down a phone is what the field holds.
	const typeCode = (typed: string) => {
		code = normalizeCode(typed);
	};

	// the refusal a code got, in the reader's own language; what the shell said is kept under it,
	// the way a refused link keeps its detail, because the rare other thing a `forbidden` means
	// here is a standing that changed while the person was typing.
	const codeRefusal = $derived.by(() => {
		if (step.kind !== 'password' || !step.codeRefusal) return null;

		return step.codeRefusal === 'lapsed'
			? $LL.organization.join.codeLapsed()
			: $LL.organization.join.codeWrong();
	});

	// the refusal's own sentence, one per kind, said in the reader's language. Where a refusal came
	// back from the shell rather than from the standing the read answered with, what it said is
	// shown under it as the detail, the way an organization that could not be reached is.
	const refusal = $derived.by(() => {
		if (step.kind !== 'refused') return null;

		switch (step.refusal) {
			case 'lapsed':
				return $LL.organization.join.lapsed();
			case 'consumed':
				return $LL.organization.join.consumed();
			case 'revoked':
				return $LL.organization.join.revoked();
			default:
				return $LL.organization.join.anotherOrganization();
		}
	});

	const title = $derived(
		step.kind === 'password' ? $LL.organization.join.passwordTitle() : $LL.organization.join.title()
	);

	const description = $derived(
		step.kind === 'password'
			? $LL.organization.join.passwordDescription()
			: $LL.organization.join.description()
	);
</script>

<StandaloneSurface tone="neutral" {title} {description} {busy}>
	{#snippet corner()}
		<!-- always available, busy or not: the way past a screen that is disabled is a trap, and a
		     link still being read costs nothing to walk away from. -->
		<SurfaceAction label={$LL.organization.join.back()} icon={BackGlyph} onclick={onBack} />
	{/snippet}

	<div class="space-y-4 pt-2" data-join-step={step.kind}>
		{#if step.kind === 'paste' || step.kind === 'unreadable'}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canConnect) onConnect(pasted);
				}}
			>
				{#if step.kind === 'unreadable'}
					<Callout tone="error">{$LL.organization.join.unreadable()}</Callout>
				{/if}

				<Field.Field>
					<Field.Label for="join-link">{$LL.organization.join.linkLabel()}</Field.Label>
					<InputGroup.Root data-disabled={busy ? 'true' : undefined}>
						<InputGroup.Addon>
							<LinkIcon />
						</InputGroup.Addon>
						<!-- a machine string, typed left to right in both locales ([[rules/frontend]], *i18n*). -->
						<InputGroup.Input
							id="join-link"
							name="link"
							dir="ltr"
							autocomplete="off"
							spellcheck={false}
							bind:value={pasted}
							disabled={busy}
						/>
					</InputGroup.Root>
				</Field.Field>

				<!-- the same glyph the walk's connect carries: one vocabulary for joining a machine to something. -->
				<Button type="submit" class="w-full justify-center" disabled={!canConnect}>
					<PlugIcon class="size-4" />
					{$LL.common.actions.connect()}
				</Button>
			</form>
		{:else if step.kind === 'inspecting'}
			<p class="text-center text-sm text-muted-foreground">{$LL.organization.join.reading()}</p>
		{:else if step.kind === 'unreachable'}
			<Callout tone="error">{$LL.organization.join.unreachable()}</Callout>
			<p class="text-sm text-muted-foreground" data-join-detail>{step.message}</p>
			<Button class="w-full justify-center" onclick={() => onConnect(step.link)}>
				{$LL.organization.join.tryAgain()}
			</Button>
		{:else if step.kind === 'refused'}
			<Callout tone="error">{refusal}</Callout>
			{#if step.message}
				<p class="text-sm text-muted-foreground" data-join-detail>{step.message}</p>
			{/if}

			{#if step.refusal === 'consumed'}
				<!-- the one control a spent link leads to: the machine is connected, so the wall is the
				     way on, and it is the wall that asks for the password this person chose. -->
				<Button class="w-full justify-center" onclick={onSignIn}>
					<LogInIcon class="size-4" />
					{$LL.organization.join.toSignIn()}
				</Button>
			{/if}
		{:else if step.kind === 'password'}
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canJoin) onJoin(step.link, code, password);
				}}
			>
				{#if codeRefusal}
					<Callout tone="error">{codeRefusal}</Callout>
					{#if step.errorMessage}
						<p class="text-sm text-muted-foreground" data-join-detail>{step.errorMessage}</p>
					{/if}
				{:else if step.errorMessage}
					<Callout tone="error">{step.errorMessage}</Callout>
				{/if}

				<!-- whom this link invites, and where: read from the link and not typed, so both are
				     lines of text rather than controls. -->
				<Field.Field>
					<Field.Label for="join-organization">
						{$LL.organization.join.organizationLabel()}
					</Field.Label>
					<p id="join-organization" class="text-sm font-medium" data-join-organization>
						{step.organizationName}
					</p>
				</Field.Field>

				<!-- drawn only where the read could name them. Since requirement 23 the link's secret
				     opens nothing on its own, so nobody is named before the code is typed, and an
				     empty line under a label says less than no line at all. -->
				{#if step.username}
					<Field.Field>
						<Field.Label for="join-username">{$LL.organization.join.usernameLabel()}</Field.Label>
						<p id="join-username" class="text-sm font-medium" data-join-username>
							{step.username}
						</p>
					</Field.Field>
				{/if}

				<!-- the code before the password, because it is the half the person was given and
				     the password is the half they are choosing: what they hold comes first. Six
				     characters, upper-cased as typed, and a machine string in both locales. -->
				<Field.Field>
					<Field.Label for="join-code">{$LL.organization.join.codeLabel()}</Field.Label>
					<InputGroup.Root data-disabled={isJoining ? 'true' : undefined}>
						<InputGroup.Addon>
							<HashIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							id="join-code"
							name="code"
							dir="ltr"
							autocomplete="one-time-code"
							autocapitalize="characters"
							spellcheck={false}
							inputmode="text"
							maxlength={CODE_LENGTH}
							class="font-mono tracking-[0.3em] uppercase"
							value={code}
							oninput={(event) => typeCode(event.currentTarget.value)}
							disabled={isJoining}
							aria-invalid={codeRefusal !== null}
						/>
					</InputGroup.Root>
					<Field.Description>{$LL.organization.join.codeDescription()}</Field.Description>
				</Field.Field>

				<Field.Field>
					<Field.Label for="join-password">
						{$LL.organization.setup.passwordLabel()}
					</Field.Label>
					<InputGroup.Root data-disabled={isJoining ? 'true' : undefined}>
						<InputGroup.Addon>
							<KeyRoundIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							id="join-password"
							name="password"
							type="password"
							autocomplete="new-password"
							bind:value={password}
							disabled={isJoining}
							aria-invalid={tooShort}
						/>
					</InputGroup.Root>
					<Field.Description>{$LL.organization.setup.passwordFloor()}</Field.Description>
					{#if tooShort}
						<Field.Error>{$LL.organization.setup.passwordTooShort()}</Field.Error>
					{/if}
				</Field.Field>

				<Field.Field>
					<Field.Label for="join-confirmation">{$LL.organization.join.confirmLabel()}</Field.Label>
					<InputGroup.Root data-disabled={isJoining ? 'true' : undefined}>
						<InputGroup.Addon>
							<KeyRoundIcon />
						</InputGroup.Addon>
						<InputGroup.Input
							id="join-confirmation"
							name="confirmation"
							type="password"
							autocomplete="new-password"
							bind:value={confirmation}
							disabled={isJoining}
							aria-invalid={mismatch}
						/>
					</InputGroup.Root>
					{#if mismatch}
						<Field.Error>{$LL.organization.join.mismatch()}</Field.Error>
					{/if}
				</Field.Field>

				<Button type="submit" class="w-full justify-center" disabled={!canJoin}>
					<LogInIcon class="size-4" />
					{isJoining ? $LL.common.actions.working() : $LL.common.actions.join()}
				</Button>
			</form>
		{/if}
	</div>
</StandaloneSurface>
