/**
 * one Drive operation at a time, in the order they were asked for.
 *
 * The lock behind the Drive commands refuses rather than waits, which is the
 * right answer to a second machine and the wrong one to this application asking
 * twice: a manual sync pressed during an automatic one should happen, not fail.
 * So every flow queues here before it calls, and what reaches the lock is
 * already serial.
 *
 * This lives in its own module because the guarantee is only worth as much as
 * the number of queues holding it. Two of them serialise their own callers and
 * nothing between them, which is indistinguishable from no queue at all for the
 * collisions that actually happen.
 */
let queue: Promise<unknown> = Promise.resolve();

/**
 * run `task` once every operation queued before it has settled.
 *
 * A failing operation does not stop the ones behind it: the queue orders work,
 * it does not couple outcomes. The returned promise is the task's own, so a
 * caller still sees its own rejection.
 */
export function enqueueGoogleDriveOperation<T>(task: () => Promise<T>): Promise<T> {
	const result = queue.catch(() => undefined).then(task);
	queue = result.then(
		() => undefined,
		() => undefined
	);

	return result;
}
