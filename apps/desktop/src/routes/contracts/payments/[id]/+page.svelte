<script lang="ts">
	import { page } from '$app/state';
	import PaymentDetails from '$lib/payment/component/details.svelte';

	const paymentId = page.params.id ?? '';
</script>

<PaymentDetails {paymentId} />
