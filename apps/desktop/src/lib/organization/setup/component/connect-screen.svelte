<script lang="ts">
	import { CODE_LENGTH, normalizeCode, type JoinStep } from '$lib/organization/setup/connect';
	import PasswordInput from '@rentable/design/block/password-input.svelte';
	import WayInSurface from '@rentable/design/block/way-in-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { PASSWORD_FLOOR } from '$lib/organization/setup/setup';
	import { UpdateAction } from '$lib/update/ui';
	import { WayInPreferences } from '$lib/settings/ui';
	import { tick, untrack } from 'svelte';

	/**
	 * The connect screen: one form of a link and its code, and what the link leads to.
	 *
	 * **One screen for both ways a link arrives.** The operating system hands a `rentable://` link
	 * to the running application and the screen opens with it in the field; a person whose platform
	 * did not hand it over pastes it there themselves. Either way the code is still to type, since
	 * a link opens nothing alone (effort 828, requirement 1), and the form takes the two halves
	 * together (requirement 17). It takes either kind of link (effort 826, requirement 10): which
	 * kind it is, is read from the link rather than asked, and a person is handed whichever kind
	 * their account calls for by whoever keeps the accounts.
	 *
	 * **The two kinds end somewhere else.** An invitation link carries the half that opens one
	 * member's vault, so the screen names the organization, takes the password they are choosing,
	 * and the accept signs them in. A machine link is for an account whose password is already set:
	 * it is connected with the code the form already took and ends at the wall, which is the
	 * shell's and not drawn here, because the password its member already has is what signs them in
	 * (effort 828, requirement 3). *A link carried no invitation half between effort 824 and effort
	 * 826, and this screen asked for no password; the code was asked for on a step of its own until
	 * the form took both halves. There was a third kind until effort 828's requirement 16: an
	 * organization link, which named the organization, carried a legible credential and admitted a
	 * machine with no code.*
	 *
	 * **Each of the two fields answers for itself.** Text that is not a link marks the link field
	 * and a code the seal refused marks the code field, both on the form that took them, because
	 * the reader's next move is to correct one of the two and a sentence that does not say which
	 * leaves them guessing ([[rules/interface]], *Validation errors*).
	 *
	 * **The code comes before anything is reached, so a refusal arrives after it.** Nothing looks at
	 * the row behind a link until the code has unsealed what reaches the organization, which is why
	 * a lapsed, consumed or revoked link is named here rather than on the read. **A link
	 * already used admits nobody, on this machine or any other** (effort 851, requirement 10):
	 * nothing was recorded, so it says the link was already used and to ask the owner or a manager
	 * for a new one, and offers nothing else. *It offered the wall until effort 851, because an
	 * invitation's accept recorded the organization before it judged the row.*
	 *
	 * **Every refusal is one line that names the next step** (effort 832, requirement 19): ask
	 * for a new link, disconnect at the sign-in, or try again. What
	 * the shell said is behind a closed disclosure under it, never a second line beside it, because
	 * the shell's refusals are translated from their reasons and the two would say the same thing
	 * twice. It is the alert pattern of Apple's Human Interface Guidelines: a short statement of
	 * what happened, and the act that answers it as the control beneath.
	 *
	 * **One surface that changes step, read like the first run** (effort 843, requirements 1, 3, 4
	 * and 5, at the human's word on 2026-10-01). The screen hands the way-in surface the step's key,
	 * where it sits ("step 1 of 2" for the link and its code, "step 2 of 2" for the password), and
	 * the way back, which the surface draws in the content area's corner and which fires `onBack`;
	 * where that leads is the route's to decide, since the screen does not know whether the step
	 * before it was the wall or the field. Nothing on the way names Turso: a person holding a link
	 * is joining an organization, and where it is kept is not theirs to know.
	 *
	 * **A field is its label and its input, and every step has one prominent action** (requirements
	 * 5 and 8). A field the person can fix marks its own line with `Field.Error`, which is the
	 * interface rule's treatment, and no callout stands over the form saying the same thing. The
	 * callout is left for what no field answers for: a refusal the read came back with, and the
	 * shell's own message where the standing changed while somebody was typing. *The two field
	 * refusals were drawn in that callout until ticket 21, which is the summary the rule names.*
	 *
	 * **The password is two fields and no meter**, the shape `change-password-form.svelte` carries
	 * and for the reason written there: there is no server to slow a guess down, so the floor is
	 * said as a sentence and the confirmation is what catches a typo.
	 *
	 * On the way-in surface, which [[rules/interface]] under *Application surfaces* gives every step
	 * before the application; it is drawn with nobody signed in, which `startup/screen.ts` allows for
	 * this one address and the first run's.
	 */
	let {
		step,
		onConnect,
		onJoin,
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
		/** the corner control, on every step; the route decides where each step goes back to. */
		onBack: () => void;
	} = $props();

	// what the form holds, which is what a person typed and never what a link carries. The two
	// fields open on what the step arrived with, so a link the operating system handed over is
	// already in the field; after that the fields are the person's and the steps are read from
	// them, which is why the first read is untracked rather than derived.
	let pasted = $state(untrack(() => (step.kind === 'paste' ? step.link : '')));
	let code = $state(untrack(() => (step.kind === 'paste' ? step.code : '')));

	// and they follow the form step when the route hands one back: back from a refusal returns
	// the link with the code cleared, because that code is spent, and a fresh link arriving
	// replaces both. What the step carries there is what the person typed or what arrived, never
	// a third thing, so the fields stay theirs.
	$effect(() => {
		if (step.kind !== 'paste') return;

		const { link, code: handed } = step;

		// the fields are read untracked: this follows the step and never the typing, or every
		// character typed would be put back to what the step arrived with.
		untrack(() => {
			if (pasted !== link) pasted = link;
			if (code !== handed) code = handed;
		});
	});
	let password = $state('');
	let confirmation = $state('');

	const isJoining = $derived(step.kind === 'password' && step.isJoining);
	const busy = $derived(step.kind === 'reading' || isJoining);
	// a code is six characters, on every link there is (effort 828, requirement 16: the one kind
	// that connected without one retired with the legible credential it carried). A field that is
	// short, or empty, is a field to finish rather than a round trip to the shell. *It admitted a
	// code-free path until this ticket, which is a continue that could only ever be refused.*
	const hasCode = $derived(code.length === CODE_LENGTH);
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

	// which of the form's two halves was refused, in the reader's own language, and each on the
	// field that answers for it ([[rules/interface]], *Validation errors*). What the shell said is
	// kept behind the disclosure under the form, the way a refused link keeps its detail.
	const linkRefusal = $derived(isUnreadable ? $LL.organization.join.unreadable() : null);

	const codeRefusalMessage = $derived.by(() => {
		if (step.kind !== 'paste' || !step.codeRefusal) return null;

		return step.codeRefusal === 'missing'
			? $LL.organization.join.codeMissing()
			: $LL.organization.join.codeWrong();
	});

	// the refusal's own sentence, one per kind, said in the reader's language, with what the shell
	// said behind the disclosure under it.
	const refusal = $derived.by(() => {
		if (step.kind !== 'refused') return null;

		switch (step.refusal) {
			case 'lapsed':
				return $LL.organization.join.lapsed();
			case 'consumed':
				// either kind of link, on this machine or another: nothing was recorded, and a new
				// link is the only way on.
				return $LL.organization.join.consumed();
			default:
				return $LL.organization.join.revoked();
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

	// two steps: the link and its code, and the password. Reading the link, and a refusal of it,
	// are still the first; only the password is the second.
	const position = $derived.by(() => {
		const at = step.kind === 'password' ? 2 : 1;

		return { at, of: 2, label: $LL.organization.setup.position({ step: at, total: 2 }) };
	});

	// the form handed back with a refusal on it is a return to it, out of the wait it was submitted
	// into, though nothing was pressed and the position did not move, so the surface runs the change
	// back (effort 843, ticket 14). Every refusal the form carries comes from a read, and a fresh
	// link carries none, so this is the step and nothing else to remember.
	const returning = $derived(
		step.kind === 'paste' &&
			(step.isUnreadable || step.codeRefusal !== null || step.errorMessage !== null)
	);

	// arriving at a step that asks for typing puts the cursor in its first field (requirement 8):
	// the link at the form, the password at the password. Each is drawn afresh on arrival, so this
	// runs once per visit.
	let linkField = $state<HTMLInputElement | null>(null);
	let passwordField = $state<HTMLInputElement | null>(null);

	$effect(() => {
		const field = linkField ?? passwordField;

		if (!field) return;

		void tick().then(() => field.focus());
	});
</script>

<!-- a refusal no field says, in one line, and what the shell said behind a closed disclosure. A
     refusal one of the two fields answers for is said on the field and never again here
     ([[rules/interface]], *Validation errors*), so only its detail is. -->
{#snippet shellRefusal(errorMessage: string | null, detail: string | null)}
	{#if errorMessage}
		<Callout tone="error">{errorMessage}</Callout>
	{/if}
	{#if detail}
		<DetailDisclosure {detail} name="join" />
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
		<Input
			id="join-code"
			name="code"
			dir="ltr"
			autocomplete="one-time-code"
			autocapitalize="characters"
			spellcheck={false}
			inputmode="text"
			maxlength={CODE_LENGTH}
			class="h-9 font-mono tracking-[0.3em] uppercase"
			value={code}
			oninput={(event) => typeCode(event.currentTarget.value)}
			disabled={busy}
			aria-invalid={codeRefused}
		/>
		<Field.Description>{$LL.organization.join.codeDescription()}</Field.Description>
		{#if codeRefusalMessage}
			<Field.Error>{codeRefusalMessage}</Field.Error>
		{/if}
	</Field.Field>
{/snippet}

<!-- back is always available, busy or not: the way past a screen that is disabled is a trap, and a
     link still being read costs nothing to walk away from. -->
<WayInSurface
	step={step.kind}
	{title}
	{description}
	{position}
	back={{ label: $LL.organization.join.back(), onclick: onBack }}
	{returning}
	{busy}
>
	<div class="flex flex-col gap-4 text-start" data-join-step={step.kind}>
		{#if step.kind === 'paste'}
			<!-- the two halves of one link, asked for together: the link a person was handed and the
			     six characters read out with it. Neither opens anything alone. -->
			<form
				class="flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canConnect) onConnect(pasted, code);
				}}
			>
				<!-- a sentence no field says goes over the form with its detail; a refusal a field says
				     keeps only its detail, under the field it belongs to, below. -->
				{#if step.errorMessage}
					{@render shellRefusal(step.errorMessage, step.detail)}
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
						class="h-9"
						bind:ref={linkField}
						bind:value={pasted}
						disabled={busy}
						aria-invalid={isUnreadable}
					/>
					{#if linkRefusal}
						<Field.Error>{linkRefusal}</Field.Error>
					{/if}
				</Field.Field>

				{@render codeField()}

				{#if !step.errorMessage && step.detail}
					<DetailDisclosure detail={step.detail} name="join" />
				{/if}

				<Button type="submit" size="lg" class="w-full" disabled={!canConnect}>
					<span class="first-letter:uppercase">{$LL.organization.join.continue()}</span>
				</Button>
			</form>
		{:else if step.kind === 'reading'}
			<p class="text-center text-sm text-muted-foreground">{$LL.organization.join.reading()}</p>
		{:else if step.kind === 'unreachable'}
			{@render shellRefusal($LL.organization.join.unreachable(), step.detail)}
			<Button size="lg" class="w-full" onclick={() => onConnect(step.link, step.code)}>
				<span class="first-letter:uppercase">{$LL.organization.join.tryAgain()}</span>
			</Button>
		{:else if step.kind === 'refused'}
			{@render shellRefusal(refusal, step.detail)}
		{:else if step.kind === 'outdated'}
			<!-- a newer rentable upgraded what the link leads to, and this machine does not hold it
			     yet (effort 857, ticket 17): the reason, and the update beside it in the same
			     callout as the switcher draws it, since updating is the one way on. Nothing else is
			     offered; the corner's way back hands the form back for after the update. -->
			<Callout tone="warning" class="flex flex-col gap-3" data-join-outdated>
				<p class="first-letter:uppercase">{step.errorMessage}</p>
				<UpdateAction variant="notice" />
			</Callout>
			{#if step.detail}
				<DetailDisclosure detail={step.detail} name="join" />
			{/if}
		{:else if step.kind === 'password'}
			<!-- the one thing a link cannot carry: the password this person is choosing. The code
			     was given on the form that took the link, and is held with it. -->
			<form
				class="flex flex-col gap-4"
				onsubmit={(event) => {
					event.preventDefault();

					if (canJoin) onJoin(step.link, step.code, password);
				}}
			>
				{@render shellRefusal(step.errorMessage, step.detail)}
				{@render organizationLine(step.organizationName)}

				<Field.Field>
					<Field.Label for="join-password">
						{$LL.organization.setup.passwordLabel()}
					</Field.Label>
					<PasswordInput
						id="join-password"
						name="password"
						autocomplete="new-password"
						class="h-9"
						bind:ref={passwordField}
						bind:value={password}
						disabled={isJoining}
						aria-invalid={tooShort}
					/>
					<Field.Description>{$LL.organization.setup.passwordFloor()}</Field.Description>
					{#if tooShort}
						<Field.Error>{$LL.organization.setup.passwordTooShort()}</Field.Error>
					{/if}
				</Field.Field>

				<Field.Field>
					<Field.Label for="join-confirmation">{$LL.organization.join.confirmLabel()}</Field.Label>
					<PasswordInput
						id="join-confirmation"
						name="confirmation"
						autocomplete="new-password"
						class="h-9"
						bind:value={confirmation}
						disabled={isJoining}
						aria-invalid={mismatch}
					/>
					{#if mismatch}
						<Field.Error>{$LL.organization.join.mismatch()}</Field.Error>
					{/if}
				</Field.Field>

				<Button type="submit" size="lg" class="w-full" disabled={!canJoin}>
					<span class="first-letter:uppercase">
						{isJoining ? $LL.common.actions.working() : $LL.common.actions.join()}
					</span>
				</Button>
			</form>
		{/if}
	</div>

	{#snippet foot()}
		<WayInPreferences />
	{/snippet}
</WayInSurface>
