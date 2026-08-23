<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { insetControl } from '$lib/design/block/form-surface.svelte';
	import { Input } from '@rentable/design/primitive/input/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import {
		firstTakenName,
		parseUnitRun,
		UNIT_RUN_LIMIT,
		type DraftUnit,
		type UnitRunRefusal
	} from '$lib/complex/unit-name';
	import MinusIcon from '@lucide/svelte/icons/minus';
	import PlusIcon from '@lucide/svelte/icons/plus';

	/**
	 * Naming the units to create: one line of typing, expanded into fields the reader still owns.
	 *
	 * **The two forms that create units render this same component**, which is why it exists. A
	 * complex is created with its units and an existing complex has units added to it later, and
	 * the two were one surface carrying the whole thing and one field carrying a single name.
	 *
	 * What differs between them is one prop: on a new complex nothing holds a name yet, and on an
	 * existing one every unit it already holds does.
	 */
	let {
		units = $bindable([]),
		error = $bindable(undefined),
		against = [],
		open
	}: {
		/** the units named so far, in the order they were named. The form submits these. */
		units: DraftUnit[];
		/**
		 * why the list cannot be submitted as it stands, shown under the entry. Bindable because
		 * the procedure refuses on the same rules and its answer belongs in the same line.
		 */
		error?: string;
		/**
		 * the names already spoken for outside this batch: the units the complex being joined
		 * already holds, and nothing at all where the complex does not exist yet.
		 */
		against?: readonly string[];
		/** whether the form holding this is open, which is when the list starts over. */
		open: boolean;
	} = $props();

	let nextKey = 0;
	let draft = $state('');

	const named = $derived(parseUnitRun(draft));

	// the refusals the notation can answer with, said in the reader's language here rather than
	// in the parser: the parser is read by tests and by no locale.
	const refusals = $derived({
		'end-before-start': $LL.complexes.form.unitRangeEndBeforeStart,
		'over-the-limit': () => $LL.complexes.form.unitRangeTooLarge({ max: UNIT_RUN_LIMIT })
	} satisfies Record<UnitRunRefusal, () => string>);

	/** the names the list holds, tidied the way a submission tidies them. */
	const listed = $derived(units.map((unit) => unit.name.trim()).filter(Boolean));

	function refuseTaken(taken: string) {
		error = $LL.complexes.form.duplicateUnitName({ name: taken });
	}

	function addUnits() {
		if (named.refusal) {
			error = refusals[named.refusal]();

			return;
		}

		if (named.names.length === 0) return;

		// the same rule the procedure enforces over the arriving set, answered while the user is
		// still holding the names rather than after they submit, and answered against the whole
		// run, which can collide with what is already listed, with the complex, and with itself.
		const taken = firstTakenName(named.names, [...against, ...listed]);

		if (taken !== undefined) {
			refuseTaken(taken);

			return;
		}

		units = [...units, ...named.names.map((name) => ({ key: nextKey++, name }))];
		draft = '';
		error = undefined;
	}

	function removeUnit(key: number) {
		units = units.filter((unit) => unit.key !== key);
		error = undefined;
	}

	// the surface is a form, so Enter would submit it with the run still sitting unexpanded in
	// the entry.
	function handleEntryKey(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;

		event.preventDefault();
		addUnits();
	}

	/**
	 * The names to create, or nothing where nothing should be created by this press.
	 *
	 * **What is written is what the list shows.** The reader names units, they join the list, and
	 * the create button persists the list; nothing is ever created that was not on screen first.
	 *
	 * So a line still sitting in the entry is added to the list by this press rather than
	 * submitted with it. It is neither discarded, which would throw away typing, nor created
	 * unseen, which would write a run the reader never got to correct. The next press creates
	 * what they can now see.
	 *
	 * The whole list is checked again rather than trusted: every expanded name stays editable,
	 * and renaming after expansion can collide as readily as expanding can.
	 *
	 * An empty answer is not a refusal. A complex may be created holding no units at all, and
	 * the caller that needs at least one says so itself.
	 */
	export function collect(): string[] | undefined {
		if (draft.trim()) {
			addUnits();

			return undefined;
		}

		const taken = firstTakenName(listed, against);

		if (taken !== undefined) {
			refuseTaken(taken);

			return undefined;
		}

		return listed;
	}

	$effect(() => {
		if (open) {
			units = [];
			draft = '';
			error = undefined;
		}
	});
</script>

<div class="flex flex-col gap-2">
	<!-- one line: a name, or a run of them. A building of eighteen is one entry rather than
	     eighteen rounds of typing and pressing. -->
	<div class="flex items-center gap-2">
		<Input
			bind:value={draft}
			placeholder={$LL.complexes.form.unitName()}
			class={insetControl}
			aria-invalid={error ? 'true' : undefined}
			aria-label={$LL.complexes.form.unitName()}
			aria-describedby="unit-draft-hint"
			onkeydown={handleEntryKey}
		/>
		<Button
			type="button"
			variant="outline"
			size="icon-sm"
			class="shrink-0"
			aria-label={$LL.common.actions.add()}
			disabled={named.names.length === 0}
			onclick={addUnits}
		>
			<PlusIcon class="size-4" />
		</Button>
	</div>

	<p id="unit-draft-hint" class="text-xs text-muted-foreground">
		{$LL.complexes.form.unitRangeHint()}
	</p>

	{#if error}
		<p class="text-sm text-destructive">{error}</p>
	{/if}

	{#if units.length === 0}
		<p class="rounded-xl border border-dashed bg-muted p-4 text-sm text-muted-foreground">
			{$LL.complexes.form.noUnitsYet()}
		</p>
	{:else}
		<!-- the rows a contract's units are transferred on, and for the same reason: this is a
		     list whose rows are added and taken away one control at a time. The name is a field
		     rather than text, because the names are what is held and every one a run produced
		     stays the reader's to correct. -->
		<ul class="flex max-h-64 flex-col gap-2 overflow-y-auto pe-1">
			{#each units as unit (unit.key)}
				<li
					class="flex items-center gap-3 rounded-xl bg-muted p-3 transition-colors hover:bg-accent"
				>
					<Input
						bind:value={unit.name}
						aria-label={$LL.complexes.form.unitName()}
						class="h-6 flex-1 rounded-lg bg-transparent px-1 text-sm font-medium hover:bg-transparent"
					/>
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						class="shrink-0"
						aria-label={`${$LL.common.actions.remove()} ${unit.name}`}
						onclick={() => removeUnit(unit.key)}
					>
						<MinusIcon class="size-4" />
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
