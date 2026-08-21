<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Administration } from '@rentable/workspace-permission';
	import { useFetchRemoteSyncState } from '$lib/settings/query';
	import { permittedBranch, type Otherwise } from '$lib/workspace/permitted';

	/**
	 * A subtree only a member the workspace permits may see.
	 *
	 * **It renders its children where this member holds every act named, and otherwise does one of
	 * two things the caller chooses between.** `otherwise` has no default, which is requirement 4's
	 * *the caller says which* turned into something the compiler asks for: a default would make one
	 * branch the one you get by not thinking, and the rule for choosing is about what absence costs
	 * a reader rather than about which branch is safer.
	 *
	 * ```svelte
	 * <Permitted acts={['renameWorkspace']} otherwise="absent">
	 *     <RenameButton />
	 * </Permitted>
	 *
	 * <Permitted acts={['inviteMember']} otherwise="unavailable" reason={$LL.workspace.notPermitted()}>
	 *     <InviteButton />
	 *     {#snippet unavailable()}<InviteButton aria-disabled="true" />{/snippet}
	 * </Permitted>
	 * ```
	 *
	 * *The spec writes the permitted subtree as an explicit `{#snippet children()}`; this repository
	 * lints that as `svelte/no-useless-children-snippet`, so it is default content. `unavailable`
	 * stays a named snippet, because it is a second one and has no other spelling.*
	 *
	 * **An unavailable control says why, and the type is what makes that unskippable.** `reason` and
	 * the `unavailable` snippet are required on that branch and forbidden on the other, through a
	 * discriminated prop type rather than a runtime check — a control that is present and does
	 * nothing without saying why is a dead control with better manners, which is the defect the
	 * inert placeholders on this page already have.
	 *
	 * **It does not draw the unavailable subtree itself.** The caller passes what an unavailable
	 * version of its own control looks like, because only the caller knows: `members.svelte` argues
	 * why an inert control is `aria-disabled` and not `disabled` — `disabled` takes it out of the
	 * keyboard order, which is exactly where a control that has to explain itself must stay — and a
	 * gate that rendered somebody else's control could not honour that.
	 *
	 * **It reads the query rather than taking permissions as a prop**, so a caller anywhere can gate
	 * without threading state down to it. `useFetchRemoteSyncState` is the one every surface on
	 * `/workspace` already reads, so this joins an existing subscription rather than adding a read.
	 *
	 * **A state that has not arrived administers nothing.** Before the query resolves there is no
	 * answer, and drawing a control on the strength of not knowing is the one outcome to avoid;
	 * zero is what a machine with no control plane, an older service and a member who administers
	 * nothing all come to, and they mean the same thing to a reader.
	 *
	 * **This is a courtesy and never the authority.** The control plane refuses the request whatever
	 * this draws, and `procedure.permitted` refuses it one layer earlier — a client is a thing a
	 * person can edit ([[rules/credentials]] is about credentials; this is the same instinct about
	 * trust).
	 *
	 * **It lives with the workspace rather than in `design/block/`** ([[rules/frontend]], under
	 * *Components*: app-level composites are shared by concepts, and domain UI lives with its
	 * domain). Every act in the vocabulary is an administrative act on a workspace. The condition
	 * for moving it is a caller outside the workspace domain, and it is one file move when that
	 * arrives.
	 */
	type Props = {
		/** the acts this subtree needs, **all** of them. Named, never a number or a role. */
		acts: readonly Administration[];
		children: Snippet;
	} & (
		| { otherwise: Extract<Otherwise, 'absent'>; reason?: never; unavailable?: never }
		| { otherwise: Extract<Otherwise, 'unavailable'>; reason: string; unavailable: Snippet }
	);

	let { acts, otherwise, reason, unavailable, children }: Props = $props();

	const remoteSyncQuery = useFetchRemoteSyncState();

	const permissions = $derived(remoteSyncQuery.data?.workspace.permissions ?? 0);
	const branch = $derived(permittedBranch(permissions, acts, otherwise));
</script>

{#if branch === 'children'}
	{@render children()}
{:else if branch === 'unavailable'}
	<!-- the caller's own control, drawn unavailable, and the sentence saying why.

	     **Wrapped, so the pair moves as one.** The caller placed one thing here — a row's control
	     slot, a toolbar, a menu — and two loose siblings would land in that slot separately and
	     lay out as though the sentence were a second control. The permitted branch has no wrapper
	     for the same reason: there, one thing is what the caller asked for.

	     The control is the caller's because only it knows what its own control looks like, down to
	     `members.svelte`'s argument for `aria-disabled` over `disabled`. The sentence is a prop
	     rather than part of that snippet because that is what makes *says why* unskippable: a
	     caller can forget a line inside its own snippet, and it cannot forget a required prop. -->
	<div class="grid gap-1">
		{@render unavailable?.()}
		<p class="text-sm text-muted-foreground">{reason}</p>
	</div>
{/if}
