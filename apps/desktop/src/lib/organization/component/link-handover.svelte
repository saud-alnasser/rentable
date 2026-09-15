<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { formatRecordDate } from '$lib/design/date';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import CopyIcon from '@lucide/svelte/icons/copy';

	/**
	 * A link and its code, handed over.
	 *
	 * **One block for two results** (effort 828, requirements 1 and 3). An invitation, a reset and
	 * a member's own second machine each end the same way: one link that is sent and one code that
	 * is read out, lapsing together on a date this prints. Drawing them twice is how the two
	 * drift, and the half that would drift first is the one sentence on the panel a person has to
	 * act on.
	 *
	 * **The code has no copy control, and that is the point.** Copying it is how it ends up pasted
	 * beside the link in the same message, which is the one thing it must never be: the link
	 * carries the credential sealed under the code and the link's own secret together, so the pair
	 * in one place is a link that opens on its own. The one affordance the code gets is being
	 * large enough to read out loud.
	 *
	 * **A date rather than a countdown.** A code lives exactly as long as the link it came with, a
	 * week or less, so what the person handing it over needs is the day it stops working. What
	 * actually refuses a lapsed link is the other machine's read of the link's own moment, so this
	 * is a fact and never the barrier. *Effort 826 drew a ninety-second countdown and a fresh-code
	 * control; a fresh code would be a fresh link text to re-send.*
	 *
	 * **The clipboard is the host's.** This takes `copied` and `onCopy` and reads no clipboard
	 * itself, because the two hosts announce a copy differently and because a block that reached
	 * for `navigator.clipboard` could not be rendered under a runner that has none.
	 *
	 * **The words that differ between the two are props, and the shape is not.** What the link is
	 * called, whom it is for and the notice above it are the host's, since an invitation is handed
	 * to somebody else and a second machine is the reader's own; everything below the notice is
	 * the same block in both.
	 *
	 * *The data attributes read `invited` because this panel was the invitation's before it was
	 * shared, and the test that pins its shape names them.*
	 */
	let {
		organizationName,
		notice,
		linkLabel,
		subject,
		link,
		code,
		expiresAt,
		unreachableWorkspaces = [],
		copied,
		onCopy
	}: {
		/** the organization the link admits into, which is the one fact a link does not say. */
		organizationName: string;
		/** the one thing the reader has to act on, said above the link. */
		notice: string;
		/** what this link is called here: an invitation's, or a machine's. */
		linkLabel: string;
		/** whom the pair is for, where it is for somebody other than the reader. */
		subject?: string;
		link: string;
		code: string;
		/** the moment the link and the code lapse together, printed as a date. */
		expiresAt: number;
		/** what a reset could not restore. Empty everywhere else. */
		unreachableWorkspaces?: { id: string; name: string }[];
		/** whether the link was just copied, so the control can say so. */
		copied: boolean;
		onCopy: () => void;
	} = $props();

	/** the date the pair lapses, in the reader's own locale. */
	const lapsesOn = $derived(formatRecordDate($locale, expiresAt));
</script>

<div class="space-y-4" data-link-handover>
	<!-- the organization the link admits into leads the panel: the link is opaque, and the one
	     fact a person hands over with it is which organization it opens. -->
	<p class="text-sm font-medium" data-invited-organization>{organizationName}</p>

	<!-- the one notice this surface carries, because it is the one thing a person has to act on. -->
	<Callout tone="warning">{notice}</Callout>

	<div class="space-y-2">
		<div class="flex flex-wrap items-baseline gap-2">
			<p class="text-sm font-medium">{linkLabel}</p>
			{#if subject}
				<p class="truncate text-sm text-muted-foreground" data-invited-username>{subject}</p>
			{/if}
		</div>
		<!-- machine strings, read left to right in both locales ([[rules/frontend]], *i18n*). -->
		<code
			dir="ltr"
			class="block overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs break-all select-all"
			data-invited-link>{link}</code
		>
		<Button type="button" variant="outline" size="sm" onclick={onCopy}>
			<CopyIcon class="size-4" />
			{copied ? $LL.organization.setup.linkCopied() : $LL.organization.setup.copyLink()}
		</Button>
	</div>

	<!-- the code under the link and drawn at the size a person reads out loud from, with the date
	     the pair lapses beside it. -->
	<div class="space-y-2" data-invited-code-block>
		<div class="flex flex-wrap items-baseline gap-2">
			<p class="text-sm font-medium">{$LL.organization.dashboard.codeTitle()}</p>
			<span class="text-xs text-muted-foreground" data-invited-expiry>
				{$LL.organization.dashboard.invitationExpires({ date: lapsesOn })}
			</span>
		</div>
		<!-- a machine string, read left to right in both locales ([[rules/frontend]], *i18n*). -->
		<p
			dir="ltr"
			class="font-mono text-3xl font-semibold tracking-[0.3em] select-all"
			data-invited-code
		>
			{code}
		</p>
		<p class="text-sm text-muted-foreground">{$LL.organization.dashboard.codeDescription()}</p>
	</div>

	{#if unreachableWorkspaces.length > 0}
		<!-- the reset's limit, said at the moment it bites: what it could not restore, because the
		     resetting administrator does not reach it themselves. -->
		<Callout tone="warning" data-invited-unreachable>
			{$LL.organization.dashboard.unreachableWorkspaces({
				workspaces: unreachableWorkspaces.map((workspace) => workspace.name).join(', ')
			})}
		</Callout>
	{/if}
</div>
