// How a feature says something to the reader: a toast, raised in the toaster's shared duration.
// The provider that mounts the toaster is `component/provider.svelte`, which the root layout
// mounts; a component is never re-exported here (plan, *Components*).
export {
	notify,
	showErrorSentence,
	showErrorToast,
	showRefusal,
	showSuccessToast,
	type NotificationId
} from './notification';
