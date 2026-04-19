import { TRPCError } from '@trpc/server';
import { toast } from 'svelte-sonner';

type ToastMessage = string | (() => string);
type ToastErrorMessage = Exclude<
	NonNullable<MutationOptions['toast']>['error'],
	boolean | undefined
>;

export type MutationOptions = {
	toast?: {
		success?: ToastMessage;
		error?: boolean | ToastMessage;
		unexpected?: ToastMessage;
	};
};

function resolveToastMessage(message: ToastMessage) {
	return typeof message === 'function' ? message() : message;
}

function isToastMessage(message: boolean | ToastMessage | undefined): message is ToastErrorMessage {
	return typeof message === 'string' || typeof message === 'function';
}

export function onMutationSuccess(opts: MutationOptions) {
	if (opts.toast?.success) {
		toast.success(resolveToastMessage(opts.toast.success));
	}
}

export function onMutationError(opts: MutationOptions, e: Error) {
	const errorToast = opts.toast?.error;

	if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
		if (errorToast === true) {
			toast.error(e.message);
		} else if (isToastMessage(errorToast)) {
			toast.error(resolveToastMessage(errorToast));
		}
	} else {
		if (errorToast === true && e.message.trim()) {
			toast.error(e.message);
		} else if (isToastMessage(errorToast)) {
			toast.error(resolveToastMessage(errorToast));
		} else if (opts.toast?.unexpected) {
			toast.error(resolveToastMessage(opts.toast.unexpected));
		}
	}
}
