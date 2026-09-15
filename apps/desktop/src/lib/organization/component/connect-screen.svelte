<script lang="ts">
	import { CODE_LENGTH, normalizeCode, type JoinStep } from '$lib/organization/connect';
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
	import { untrack } from 'svelte';

	/**
	 * The connect screen: one form of a link and its code, and what the link leads to.
	 *
	 * **One screen for both ways a link arrives.** The operating system hands a `rentable://` link
	 * to the running application and the screen opens with it in the field; a person whose platform
	 * did not hand it over pastes it there themselves. Either way the code is still to type, since
	 * a link opens nothing alone (effort 828, requirement 1), and the form takes the two halves
	 * together (requirement 17). It takes every kind of link (effort 826, requirement 10): which
	 * kind it is, is read from the link rather than asked.
	 *
	 * **Each kind ends somewhere else.** An organization link names the organization and admits
	 * nobody, so the machine records it and the person stands at the wall, which is the shell's and
	 * not drawn here. A second machine's link is connected with the code the form already took, and
	 * ends at the same wall, because its member already has a password (effort 828, requirement 3).
	 * An invitation link carries the half that opens one member's vault, so the screen names the
	 * organization, takes the password they are choosing, and the accept signs them in. *A link
	 * carried no invitation half between effort 824 and effort 826, and this screen asked for no
	 * password; the code was asked for on a step of its own until the form took both halves.*
	 *
	 * **Each of the two fields answers for itself.** Text that is not a link marks the link field
	 * and a code the seal refused marks the code field, both on the form that took them, because
	 * the reader's next move is to correct one of the two and a sentence that does not say which
	 * leaves them guessing ([[rules/interface]], *Validation errors*).
	 *
	 * **The code comes before anything is reached, so a refusal arrives after it.** Nothing looks at
	 * the row behind a link until the code has unsealed what reaches the organization, which is why
	 * a lapsed, consumed, revoked or replaced link is named here rather than on the read. Each says
	 * its own sentence: a lapsed or a revoked invitation says to ask whoever invited for a new link;
	 * a replaced machine link says to make another from the you section; a link for another
	 * organization says to disconnect first. A link already opened is the ordinary way a person sets
	 * up a second machine, since a member signs in on as many machines as they like and the link is
	 * spent on the first: it says so and offers the wall, where the password they chose admits them.
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
		/**
		 * a link to read and the code that came with it. The route runs the read, and then whichever
		 * act the link's kind named: each opens what the link seals with the link's secret and the
		 * code together (effort 826, requirement 23; effort 828, requirement 1).
		 */
		onConnect: (link: string, code: string) => void;
		/**
		 * the password an invited person is choosing, over the link and the code the form took. The
		 * accept is the one act that asks for anything past the form.
		 */
		onJoin: (link: string, code: string, password: string) => void;
		/** the wall, offered on a link that was already opened: the machine is connected. */
		onSignIn: () => void;
		/** the corner control, on every step; the route decides where each step goes back to. */
		onBack: () => void;
	} = $props();

	// what the form holds, which is what a person typed and never what a link carries. The two
	// fields open on what the step arrived with, so a link the operating system handed over is
	// already in the field; after that the fields are the person's and the steps are read from
	// them, which is why the first read is untracked rather than derived.
	let pasted = $state(untrack(() => (step.kind === 'paste' ? step.link : '')));
	let code = $state(untrack(() => (step.kind === 'paste' ? step.code : '')));
	let password = $state('');
	let confirmation = $state('');

	const isJoining = $derived(step.kind === 'password' && step.isJoining);
	const busy = $derived(step.kind === 'reading' || isJoining);
	// a code is six characters or none: the organization's own link still connects without one
	// (effort 828, requirement 16 retires it), and a half-typed code is a field to finish rather
	// than a round trip to the shell.
	const hasCode = $derived(code.length === 0 || code.length === CODE_LENGTH);
	const canConnect = $derived(pasted.trim().length > 0 && hasCode && !busy);
	const tooShort = $derived(password.length > 0 && password.length < PASSWORD_FLOOR);
	const mismatch = $derived(confirmation.length > 0 && confirmation !== password);
	const canJoin = $derived(
		password.length >= PASSWORD_FLOOR && confirmation === password && !isJoining
	);

	// the code as the person types it: upper-cased, and the spaces and hyphens somebody reading
	// one out puts in taken off, so what was said down a phone is what the field holds.
	const typeCode = (typed: string) => {
		code = normalizeCode(typed);
	};

	const isUnreadable = $derived(step.kind === 'paste' && step.isUnreadable);
	const codeRefused = $derived(step.kind === 'paste' && step.codeRefusal !== null);

	// which of the form's two halves was refused, in the reader's own language. What the shell said
	// is kept under it, the way a refused link keeps its detail, because the rare other thing a
	// `forbidden` means here is a standing that changed while the person was typing.
	const fieldRefusal = $derived.by(() => {
		if (step.kind !== 'paste') return null;

		if (step.isUnreadable) return $LL.organization.join.unreadable();

		if (!step.codeRefusal) return null;

		return step.codeRefusal === 'missing'
			? $LL.organization.join.codeMissing()
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
			case 'replaced':
				return $LL.organization.join.replaced();
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

<!-- what a step says went wrong, over its fields: the refusal by name where one of the two fields
     is the answer, and what the shell said either under it or on its own. -->
{#snippet refusalCallouts(errorMessage: string | null)}
	{#if fieldRefusal}
		<Callout tone="error">{fieldRefusal}</Callout>
		{#if errorMessage}
			<p class="text-sm text-muted-foreground" data-join-detail>{errorMessage}</p>
		{/if}
	{:else if errorMessage}
		<Callout tone="error">{errorMessage}</Callout>
	{/if}
{/snippet}

<!-- which organization the link names: read from the link and not typed, so it is a line of text
     rather than a control. Nobody is named beside it, because nothing opens the invited vault
     before the code is typed (effort 826, requirement 23). -->
{#snippet organizationLine(organizationName: string)}
	<Field.Field>
		<Field.Label for="join-organization">{$LL.organization.join.organizationLabel()}</Field.Label>
		<p id="join-organization" class="text-sm font-medium" data-join-organization>
			{organizationName}
		</p>
	</Field.Field>
{/snippet}

<!-- the code under the link it came with: the two were handed over together and are given back
     together. Six characters, upper-cased as typed, and a machine string in both locales. -->
{#snippet codeField()}
	<Field.Field>
		<Field.Label for="join-code">{$LL.organization.join.codeLabel()}</Field.Label>
		<InputGroup.Root data-disabled={busy ? 'true' : undefined}>
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
				disabled={busy}
				aria-invalid={codeRefused}
			/>
		</InputGroup.Root>
		<Field.Description>{$LL.organization.join.codeDescription()}</Field.Description>
	</Field.Field>
{/snippet}

<StandaloneSurface tone="neutral" {title} {description} {busy}>
	{#snippet corner()}
		<!-- always available, busy or not: the way past a screen that is disabled is a trap, and a
		     link still being read costs nothing to walk away from. -->
		<SurfaceAction label={$LL.organization.join.back()} icon={BackGlyph} onclick={onBack} />
	{/snippet}

	<div class="space-y-4 pt-2" data-join-step={step.kind}>
		{#if step.kind === 'paste'}
			<!-- the two halves of one link, asked for together: the link a person was handed and the
			     six characters read out with it. Neither opens anything alone. -->
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canConnect) onConnect(pasted, code);
				}}
			>
				{@render refusalCallouts(step.errorMessage)}

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
							aria-invalid={isUnreadable}
						/>
					</InputGroup.Root>
				</Field.Field>

				{@render codeField()}

				<!-- the same glyph the walk's connect carries: one vocabulary for joining a machine to something. -->
				<Button type="submit" class="w-full justify-center" disabled={!canConnect}>
					<PlugIcon class="size-4" />
					{$LL.common.actions.connect()}
				</Button>
			</form>
		{:else if step.kind === 'reading'}
			<p class="text-center text-sm text-muted-foreground">{$LL.organization.join.reading()}</p>
		{:else if step.kind === 'unreachable'}
			<Callout tone="error">{$LL.organization.join.unreachable()}</Callout>
			<p class="text-sm text-muted-foreground" data-join-detail>{step.message}</p>
			<Button class="w-full justify-center" onclick={() => onConnect(step.link, step.code)}>
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
			<!-- the one thing a link cannot carry: the password this person is choosing. The code
			     was given on the form that took the link, and is held with it. -->
			<form
				class="space-y-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canJoin) onJoin(step.link, step.code, password);
				}}
			>
				{@render refusalCallouts(step.errorMessage)}
				{@render organizationLine(step.organizationName)}

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
