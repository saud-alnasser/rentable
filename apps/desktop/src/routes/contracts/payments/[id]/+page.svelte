<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import PaymentDetails from '$lib/payment/component/details.svelte';

	const paymentId = $derived(page.params.id ?? '');
</script>

<!-- keyed on the record, so moving from one record to another of this kind (a renewal, the
     palette, a link, the back button) shows the second from its own start rather than keeping the
     first on screen. -->
{#key paymentId}
	<PaymentDetails {paymentId} sections={sectionsOn('payment')} />
{/key}
