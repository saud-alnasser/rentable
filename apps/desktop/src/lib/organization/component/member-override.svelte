<script lang="ts">
	import { Checkbox } from '@rentable/design/primitive/checkbox/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import MemberSectionHead from '$lib/organization/component/member-section-head.svelte';
	import { EDITABLE_FAMILIES, familyName, flagName, flagPhrase } from '$lib/organization/role';
	import {
		FAMILIES,
		effective,
		maskOf,
		permits,
		xorOf,
		type Flag
	} from '@rentable/workspace-permission';
	import CheckIcon from '@lucide/svelte/icons/check';
	import MinusIcon from '@lucide/svelte/icons/minus';

	/**
	 * What a member may do, flag by flag: what their role gives, what is changed for them alone,
	 * and what they end up with (effort 838, requirements 6 and 12).
	 *
	 * **Three columns, and the middle one is the control.** A member's permissions are their role's
	 * mask exclusive-or'd with their override, so a flag ticked in the middle column turns the role's
	 * flag off where the role carries it and on where it does not, and the last column says which.
	 * Showing all three is what the spec leans on against the override's drift: when the role picked
	 * above changes, the first column changes under a middle column that stays, and the reader sees
	 * the result move before anything is saved.
	 *
	 * **Grouped by family**, the organization's first and then each record kind, in the order the
	 * roles list and the role editor read them. The owner's own family is not here: no override can
	 * carry one of its flags.
	 *
	 * **A flag the reader does not hold is theirs neither to give nor to take** (requirement 7), so
	 * its box is drawn refused with the reason on its row. Where the reader may not change anybody's
	 * override at all, every box is refused and the head says why, once.
	 *
	 * **Shared by the sheet that adds a member and the sheet that edits one**, in place of the list
	 * of acts beyond a role both drew until effort 838 (`member-acts.svelte`, retired).
	 *
	 * **Nothing is written from here.** The sheet's own submit writes the override.
	 */
	let {
		id,
		roleMask,
		override = $bindable(),
		held,
		refusal = null,
		disabled,
		error = null
	}: {
		/** the section's name in the document: its head is `<id>` and its legend `<id>-legend`. */
		id: string;
		/** what the role chosen carries. */
		roleMask: number;
		/** the flags switched for this member alone. */
		override: number;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		held: number;
		/** why the reader may not change the override at all, or `null` where they may. */
		refusal?: string | null;
		disabled: boolean;
		/** what the override was refused with, or `null`. */
		error?: string | null;
	} = $props();

	const result = $derived(effective(roleMask, override));

	const flip = (flag: Flag) => {
		override = xorOf(override, maskOf(flag));
	};
</script>

{#snippet mark(yes: boolean)}
	{#if yes}
		<CheckIcon class="mx-auto size-4" aria-hidden="true" />
	{:else}
		<MinusIcon class="mx-auto size-4 text-muted-foreground" aria-hidden="true" />
	{/if}
	<span class="sr-only">
		{yes ? $LL.organization.override.yes() : $LL.organization.override.no()}
	</span>
{/snippet}

<Field.Set class="gap-3" aria-labelledby={`${id}-legend`} data-sheet-section="override">
	<MemberSectionHead
		{id}
		legend={$LL.organization.override.legend()}
		description={$LL.organization.override.description()}
	/>

	{#if refusal}
		<Field.Description data-override-refusal>{refusal}</Field.Description>
	{/if}

	<div class="flex flex-col gap-4">
		{#each EDITABLE_FAMILIES as family (family)}
			<table class="w-full border-collapse text-sm" data-override-family={family}>
				<thead>
					<tr class="border-b border-border/60 text-xs text-muted-foreground">
						<th scope="col" class="py-1.5 text-start font-medium text-foreground">
							{familyName($LL, family)}
						</th>
						<th scope="col" class="w-16 py-1.5 text-center font-medium">
							{$LL.organization.override.role()}
						</th>
						<th scope="col" class="w-20 py-1.5 text-center font-medium">
							{$LL.organization.override.changed()}
						</th>
						<th scope="col" class="w-16 py-1.5 text-center font-medium">
							{$LL.organization.override.result()}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each FAMILIES[family] as flag (flag)}
						{@const notHeld = !permits(held, flag)}
						{@const changed = permits(override, flag)}
						<tr class="border-b border-border/40" data-override-flag={flag}>
							<th scope="row" class="py-1.5 text-start font-normal">
								<span class="block leading-snug">{flagName($LL, flag)}</span>
								{#if notHeld && !refusal}
									<span
										id={`${id}-${flag}-reason`}
										class="block text-xs text-muted-foreground"
										data-override-reason={flag}
									>
										{$LL.organization.dashboard.notHeld()}
									</span>
								{/if}
							</th>
							<td class="py-1.5 text-center" data-override-role={flag}>
								{@render mark(permits(roleMask, flag))}
							</td>
							<td class="py-1.5 text-center">
								<Checkbox
									id={`${id}-${flag}`}
									checked={changed}
									aria-label={$LL.organization.override.change({ flag: flagPhrase($LL, flag) })}
									aria-describedby={notHeld && !refusal ? `${id}-${flag}-reason` : undefined}
									disabled={disabled || refusal !== null || notHeld}
									onCheckedChange={() => flip(flag)}
									data-override-change={flag}
								/>
							</td>
							<td class="py-1.5 text-center" data-override-result={flag}>
								{@render mark(permits(result, flag))}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/each}
	</div>

	{#if error}
		<Field.Error data-sheet-error="override">{error}</Field.Error>
	{/if}
</Field.Set>
