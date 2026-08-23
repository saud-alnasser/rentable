<script lang="ts">
	/**
	 * The subject the provider itself is proved against, and not part of the interface.
	 *
	 * **It renders both halves of the contract on one element it owns, and renders them on sight.**
	 * `dialog` and `sheet` render both halves too, as of #780, and either could stand in; each does
	 * it from inside a `bits-ui` portal that has to be opened first, so a failure there points at
	 * the overlay as readily as at the provider. This points at the provider and nothing else.
	 *
	 * `lib/tests/strings.svelte.test.ts` takes it three times. The language-switch test is the
	 * one that needs both halves at once, because the failure it pins is the provider writing a
	 * frozen object rather than getters, which shows up as a word and a direction going stale in
	 * step. The other two cover the string on its own and the throw a missing provider raises,
	 * and either could take a packaged component instead.
	 *
	 * A packaged family reading a direction is covered where it lives: `card`, `dialog`, `sheet`
	 * and `sidebar` each have a test of their own for it, the last of them for both the attribute
	 * and the side its tooltips stand on.
	 *
	 * It sits in this `tests/` directory rather than beside `probe.svelte` because what it covers
	 * is a module of the package rather than the runner itself, and a test here lives under the
	 * directory it covers.
	 */
	import { useDesignContract } from '#lib/strings.js';

	const contract = useDesignContract();
</script>

<p data-testid="contract" dir={contract.direction}>{contract.strings.loading}</p>
