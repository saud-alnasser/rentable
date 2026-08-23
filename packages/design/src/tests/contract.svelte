<script lang="ts">
	/**
	 * The subject the provider itself is proved against, and not part of the interface.
	 *
	 * **It renders both halves of the contract on one element, which is what keeps it here now
	 * that #779 has landed packaged families that read a direction.** No packaged component does
	 * both: `card` renders a direction and no word, `spinner` renders a word and no direction.
	 *
	 * `lib/tests/strings.svelte.test.ts` takes it three times. The language-switch test is the
	 * one that needs both halves at once, because the failure it pins is the provider writing a
	 * frozen object rather than getters, which shows up as a word and a direction going stale in
	 * step. The other two cover the string on its own and the throw a missing provider raises,
	 * and either could take a packaged component instead.
	 *
	 * A packaged family reading a direction is covered where it lives, in
	 * `lib/primitive/card/tests/card.svelte.test.ts`.
	 *
	 * It sits in this `tests/` directory rather than beside `probe.svelte` because what it covers
	 * is a module of the package rather than the runner itself, and a test here lives under the
	 * directory it covers.
	 */
	import { useDesignContract } from '#lib/strings.js';

	const contract = useDesignContract();
</script>

<p data-testid="contract" dir={contract.direction}>{contract.strings.loading}</p>
