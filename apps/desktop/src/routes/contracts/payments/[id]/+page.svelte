<script lang="ts">
	import { page } from '$app/state';
	import { sectionsOn } from '$lib/app/surfaces';
	import PaymentDetails from '$lib/payment/component/details.svelte';

	const paymentId = page.params.id ?? '';
</script>

<PaymentDetails {paymentId} sections={sectionsOn('payment')} />
