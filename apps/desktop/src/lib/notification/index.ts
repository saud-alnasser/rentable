// How a feature says something to the reader: a toast, which leaves in the toaster's shared
// duration unless it is an error, which stands until the reader closes it.
// The provider that mounts the toaster, which the root layout mounts, is reached through `ui.ts`;
// a component is never re-exported here (plan, *Components*).
export {
	notify,
	showErrorSentence,
	showErrorToast,
	showRefusal,
	showSuccessToast,
	type NotificationId
} from './notification';
