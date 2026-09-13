<script lang="ts">
	import type { JoinStep } from '$lib/organization/join';
	import StandaloneSurface from '@rentable/design/block/standalone-surface.svelte';
	import SurfaceAction from '@rentable/design/block/surface-action.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as InputGroup from '@rentable/design/primitive/input-group/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import BackGlyph from './back-glyph.svelte';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PlugIcon from '@lucide/svelte/icons/plug';

	/**
	 * The connect screen: the organization's link, read and recorded.
	 *
	 * **One screen for both ways a link arrives.** The operating system hands a `rentable://` link
	 * to the running application and the screen opens with it already being read; a person whose
	 * platform did not hand it over pastes it into the field. From there there is nothing to ask:
	 * the link names the organization, this machine records it, and the person stands at the wall,
	 * which asks for the username and the password. A link carried an invitation half and this
	 * screen asked for a password until effort 824 retired both; being admitted is the wall's.
	 *
	 * **Four steps, and a read link is not one of them.** The field, the wait while the link is
	 * read, text that was not a link, and an organization that could not be reached. A link that
	 * was read ends this screen, because what follows is the wall and the wall is the shell's.
	 *
	 * **Every step can be left from the card's corner, and only from there.** The surface's
	 * `corner` slot is where a reader looks for the way past a screen, and the one control in it
	 * fires `onBack`; where that leads is the route's to decide, since the screen does not know
	 * whether the step before it was the wall or the field.
	 *
	 * **The field's glyph is its subject and never its error, and the primary carries its verb.**
	 * The leading addon is muted so it does not outweigh the label beside it (*Balance weight and
	 * contrast*, Refactoring UI p.56); a refusal is still said in a callout above the form.
	 *
	 * On the application surface rather than in the frame, because it is drawn with nobody signed
	 * in, which `layout/shell-surface.ts` allows for this one address and the first run's.
	 */
	let {
		step,
		onConnect,
		onBack
	}: {
		step: JoinStep;
		/** a link to read and record; the route runs the connect and raises the wall on it. */
		onConnect: (link: string) => void;
		/** the corner control, on every step; the route decides where each step goes back to. */
		onBack: () => void;
	} = $props();

	let pasted = $state('');

	const busy = $derived(step.kind === 'inspecting');
	const canConnect = $derived(pasted.trim().length > 0 && !busy);
</script>

<StandaloneSurface
	tone="neutral"
	title={$LL.organization.join.title()}
	description={$LL.organization.join.description()}
	{busy}
>
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
		{/if}
	</div>
</StandaloneSurface>
