<script lang="ts">
	import * as Collapsible from '@rentable/design/primitive/collapsible/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import PermissionSwitches from '$lib/organization/component/permission-switches.svelte';
	import {
		firstUnheldTailored,
		tailoredShown,
		tailoredTo,
		type WorkspaceTailoring
	} from '$lib/organization/role';
	import { RECORD_FLAGS, maskOf, permits } from '@rentable/workspace-permission';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';

	/**
	 * What a member may do in one workspace they are in, beneath its switch on their card (effort
	 * 838, requirement 12 as amended a third time 2026-09-27, and a fourth time 2026-09-28, the
	 * human's call: "a main switch to access and permissions; remove the read only button and
	 * reset on the workspace").
	 *
	 * **The workspace's switch is its access, and beneath it one folded row, *permissions***,
	 * reading *custom* beside it where what the member may do here differs from what they may do
	 * across the organization. Opened, it is the record groups of the switch list the role editor
	 * and the card share (`permission-switches.svelte`, `records`), each folding in turn, set to
	 * what the member ends up with there. That is the Human Interface Guidelines' disclosure:
	 * detail a reader asks for, kept out of sight until then (*Disclosure controls*).
	 *
	 * **What is set here is what differs** (`tailoredTo`). A switch turned away from what the
	 * member holds across the organization is set for this workspace, and holds whatever is later
	 * changed there; a switch turned back is no longer set. Each switch that differs carries a dot
	 * saying so. There is no reset and no read only button: turning the switches back is the reset,
	 * and read only is every add, edit and delete turned off. *Both were preset buttons above the
	 * switches until the fourth amendment of requirement 12.*
	 *
	 * **A grant minted read only opens with its writes off**, which differ from the organization's,
	 * so they are marked; turning a write on there grants the workspace again at full access, and
	 * every write left off is then set off here, so the member ends up with what the switches say.
	 *
	 * **A switch the reader may not turn says why**, as the switch list's do: every one where the
	 * reader lacks `overrideMember` (`refusal`); a change that would set or unset a flag the reader
	 * does not hold, since Rust signs the row under the reader's certificate; and turning a write
	 * on over a grant minted read only where re-granting it full access would be refused
	 * (`regrantRefusal`).
	 */
	let {
		id,
		organizationWide,
		held,
		value,
		onChange,
		readerPermissions,
		refusal = null,
		regrantRefusal = null,
		disabled
	}: {
		/** what the fold and its switches are named by in the document. */
		id: string;
		/** what the member may do across the organization, as the card has it now. */
		organizationWide: number;
		/** what the workspace holds before this save: its grant's level and what is set there. */
		held: WorkspaceTailoring;
		/** what the workspace comes to as the switches stand. */
		value: WorkspaceTailoring;
		onChange: (value: WorkspaceTailoring) => void;
		/** what the reader may do: a flag outside it is not theirs to switch. */
		readerPermissions: number;
		/** why the reader may change nothing here, or `null` where they may. */
		refusal?: string | null;
		/** why re-granting this workspace at full access would be refused, or `null`. */
		regrantRefusal?: string | null;
		disabled: boolean;
	} = $props();

	let open = $state(false);

	const shown = $derived(tailoredShown(organizationWide, value));

	/** what the member may do with records across the organization, with nothing set here. */
	const across = $derived(
		tailoredShown(organizationWide, { access: 'full-access', pinned: 0, granted: 0 })
	);

	/** the switches that differ from what the member holds across the organization. */
	const differing = $derived(
		maskOf(...RECORD_FLAGS.filter((flag) => permits(across, flag) !== permits(shown, flag)))
	);

	/** why a workspace coming to `next` would be refused, beyond the flag a switch names. */
	const refusalOfPlan = (next: WorkspaceTailoring): string | null => {
		if (next.access === 'full-access' && held.access === 'read-only' && regrantRefusal) {
			return regrantRefusal;
		}

		return firstUnheldTailored(readerPermissions, held, next)
			? $LL.organization.workspaceSwitches.movesNotHeld()
			: null;
	};

	const planOf = (next: number) => tailoredTo(organizationWide, held.access, next);
</script>

<!-- indented to the workspace's name, so the glyph's column stays the row's. -->
<Collapsible.Root bind:open class="flex flex-col ps-6" data-tailor={id}>
	<Collapsible.Trigger
		class="flex min-h-8 w-full items-center gap-2 rounded-xl text-start text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
		data-tailor-fold
	>
		<span class="min-w-0 flex-1 first-letter:uppercase">
			{$LL.organization.workspaceSwitches.permissions()}
		</span>
		{#if differing !== 0}
			<span class="flex shrink-0 items-center gap-1.5 text-xs" data-tailor-custom>
				<span class="size-2 rounded-full bg-primary" aria-hidden="true"></span>
				{$LL.organization.switches.custom()}
			</span>
		{/if}
		<ChevronDownIcon
			class="size-4 shrink-0 transition-transform duration-quick ease-move {open
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		/>
	</Collapsible.Trigger>

	<Collapsible.Content>
		<!-- drawn only while open, so what nobody opened reaches neither a reader nor a screen
		     reader. -->
		{#if open}
			<div class="flex flex-col gap-3 pt-1 pb-1" data-tailor-open={id}>
				<p class="text-xs leading-snug text-muted-foreground" data-tailor-says>
					{$LL.organization.workspaceSwitches.permissionsSays()}
				</p>

				<PermissionSwitches
					{id}
					mask={shown}
					onChange={(next) => onChange(planOf(next))}
					held={readerPermissions}
					{refusal}
					refusalOf={(next) => refusalOfPlan(planOf(next))}
					{disabled}
					marked={{
						mask: differing,
						label: $LL.organization.workspaceSwitches.differs()
					}}
					records
				/>
			</div>
		{/if}
	</Collapsible.Content>
</Collapsible.Root>
