<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
	import DetailDisclosure from '$lib/error/component/detail-disclosure.svelte';
	import { LL } from '$lib/i18n/i18n-svelte';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import BanIcon from '@lucide/svelte/icons/ban';
	import BuildingIcon from '@lucide/svelte/icons/building';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlugIcon from '@lucide/svelte/icons/plug';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import UserPlusIcon from '@lucide/svelte/icons/user-plus';

	import type { SetupStatement, WalkRefusal } from '../setup';

	/**
	 * The walk's first step (`walk.svelte`): what the consent has come to, the way on or the
	 * consent itself, and the facts behind a disclosure under the button. The walk says why it is
	 * drawn this way; this draws it.
	 */
	let {
		consent,
		refusal,
		holdsTursoAuthority,
		statements,
		isBusy,
		isConnecting,
		factsOpen = $bindable(),
		onOpenDashboard,
		onConnect,
		onDisconnect,
		onContinue
	}: {
		/** how far the consent has got, or `idle` where none has been started. */
		consent: {
			status: 'idle' | 'pending' | 'granted' | 'failed' | 'abandoned';
			error: string | null;
		};
		/** what refused the run, where the way on is another consent; the walk says which. */
		refusal: WalkRefusal | null;
		/** whether the machine already holds the authority a consent would grant. */
		holdsTursoAuthority: boolean;
		/** the facts the step says, in the order the walk's description holds them. */
		statements: readonly SetupStatement[];
		/** the walk is waiting on the shell, and its controls with it. */
		isBusy: boolean;
		/** the consent is being opened. */
		isConnecting: boolean;
		/**
		 * whether the facts are open. The walk holds it, so a person who opened them finds them
		 * as they left them when they come back to this step.
		 */
		factsOpen: boolean;
		onOpenDashboard: () => void;
		onConnect: () => void;
		onDisconnect: () => void;
		onContinue: () => void;
	} = $props();

	/**
	 * Each fact with its own glyph, in the order the person needs them: how far the consent
	 * reaches, what one group may hold, which account to grant it on, where the organization
	 * will live afterwards, and the one thing the next step may ask them to type. The
	 * glyph is specific to the fact rather than a checkmark, which is the book's own
	 * recommendation on p.220.
	 */
	const statementText = (statement: SetupStatement) =>
		({
			groupCoverage: $LL.organization.setup.groupCoverage(),
			oneOrganization: $LL.organization.setup.oneOrganization(),
			accountCreation: $LL.organization.setup.accountCreation(),
			succession: $LL.organization.setup.succession(),
			groupAskedOnce: $LL.organization.setup.groupAskedOnce()
		})[statement];

	const statementGlyph: Record<SetupStatement, typeof BuildingIcon> = {
		groupCoverage: DatabaseIcon,
		// the fact is a refusal, so the glyph is one, rather than a second building beside the
		// one succession carries.
		oneOrganization: BanIcon,
		accountCreation: UserPlusIcon,
		succession: BuildingIcon,
		// the fact is about typing one word, so the glyph is the one the reader already reads as
		// writing, rather than the field's own layers repeated up here.
		groupAskedOnce: PencilIcon
	};

	/**
	 * whether the consent is granted, either because the poll said so or because the machine
	 * already held the authority when the walk opened. A consent that was started here says what
	 * it said; only a walk that has started none reads the machine's standing.
	 */
	const granted = $derived(
		consent.status === 'granted' || (consent.status === 'idle' && holdsTursoAuthority)
	);

	/**
	 * What the consent step has to say beyond the facts, and only where something happened:
	 * a create the group refused is said first, a granted consent is confirmed, an abandoned or
	 * refused consent is said, and a pending one names the browser window. Nothing is shown before the person has pressed anything, unless the
	 * machine already held the authority, in which case the confirmation is what it opens with.
	 */
	const consentNotice = $derived.by(
		(): {
			tone: 'success' | 'warning' | 'error';
			message: string;
			detail: string | null;
		} | null => {
			// a refusal outranks everything else the step could say: it is why the person is
			// back here, and the consent it speaks of is already gone.
			if (refusal) {
				return { tone: 'error', message: refusal.sentence, detail: refusal.detail };
			}

			if (granted) {
				return { tone: 'success', message: $LL.organization.setup.connected(), detail: null };
			}

			switch (consent.status) {
				case 'abandoned':
					return {
						tone: 'warning',
						message: $LL.organization.setup.consentAbandoned(),
						detail: null
					};
				case 'failed':
					// what the authorization server said is its own words, in its own language, so it
					// sits behind a disclosure under the sentence rather than inside it.
					return {
						tone: 'error',
						message: $LL.organization.setup.consentFailed(),
						detail: consent.error
					};
				default:
					return null;
			}
		}
	);
</script>

{#if consentNotice}
	<div class="space-y-1" data-setup-consent-notice>
		<Callout tone={consentNotice.tone}>{consentNotice.message}</Callout>

		{#if consentNotice.detail}
			<DetailDisclosure detail={consentNotice.detail} name="consent" />
		{/if}
	</div>
{/if}

<div class="space-y-2">
	{#if granted}
		<!-- the way on asks the account what it already holds before it decides which step
		     follows, which is a round trip: disabled while it is in flight, and saying so,
		     because a second press would ask again. -->
		<Button class="w-full justify-center" onclick={onContinue} disabled={isBusy}>
			<ArrowRightIcon class="size-4 rtl:rotate-180" />
			{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.continue()}
		</Button>
		<!-- the way to give the authority back: outline beside the primary, its verb's glyph
		     before one word, and the callout above already says what is connected. -->
		<Button variant="outline" class="w-full justify-center" onclick={onDisconnect}>
			<UnplugIcon class="size-4" />
			{$LL.organization.dashboard.forgetAccount()}
		</Button>
	{:else}
		<Button class="w-full justify-center" onclick={onConnect} disabled={isBusy}>
			<PlugIcon class="size-4" />
			{isConnecting ? $LL.common.actions.working() : $LL.organization.setup.connect()}
		</Button>
	{/if}
</div>

<!-- the facts, closed, under the button: quiet, the way the sign-in card keeps its help, so
     the card is one line and the consent until somebody asks for more. Opened, they are a
     list with a glyph to each fact, in the order they are needed, and the dashboard action
     sits inside the first fact, which is the one it helps with. -->
<Collapsible.Root bind:open={factsOpen} data-setup-facts>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="link"
				size="sm"
				class="w-full justify-center text-muted-foreground"
			>
				{$LL.organization.setup.connectDetails()}
			</Button>
		{/snippet}
	</Collapsible.Trigger>

	<Collapsible.Content>
		<!-- drawn only while open, so facts nobody asked for reach neither a reader nor a
		     screen reader. -->
		{#if factsOpen}
			<ul class="space-y-3 pt-2 text-sm text-muted-foreground">
				{#each statements as statement (statement)}
					{@const Glyph = statementGlyph[statement]}
					<li class="flex gap-3" data-setup-statement={statement}>
						<!-- centred on the sentence's first line, which is `text-sm`'s 20px,
						     rather than nudged down by a margin off the spacing ladder. -->
						<span class="flex h-5 shrink-0 items-center">
							<Glyph class="size-4" />
						</span>
						<span class="min-w-0 flex-1">
							{statementText(statement)}
							{#if statement === 'groupCoverage'}
								<Button
									variant="link"
									class="h-auto p-0 align-baseline text-sm"
									onclick={onOpenDashboard}
									disabled={isBusy}
								>
									{$LL.organization.setup.openDashboard()}
								</Button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</Collapsible.Content>
</Collapsible.Root>
