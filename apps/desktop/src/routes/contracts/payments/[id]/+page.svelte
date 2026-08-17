<script lang="ts">
	import { page } from '$app/state';
	import PaymentDetails from '$lib/payment/component/details.svelte';

	const paymentId = Number(page.params.id);
</script>

<PaymentDetails {paymentId} />
