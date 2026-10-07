//! how long a replica's push or pull may wait on the remote before it is the offline case.
//!
//! **The engine sets no limit of its own.** `turso::sync` (0.8.1) runs every request on one IO
//! thread through a hyper client with no timeouts, so on a network that takes the request and
//! never answers, a push or a pull waits forever, and so does whoever holds the database lock
//! around it (effort 854, requirement 15).
//!
//! **Silence, not a deadline.** A call is given up after [`SYNC_BOUND`]'s silence without one
//! sign of progress, and the clock starts again at each one: the engine's IO thread wakes the
//! waiting call when the status arrives and at every chunk of the body (`IoWorker::process_http`).
//! A deadline on the whole call would cut a large first pull on a slow link that is working, and
//! that pull would then read as "has not reached this machine yet" for good. A link that trickles
//! a byte now and then is never silent, so a ceiling stands behind the silence.
//!
//! **A call given up answers what the offline case already answers**: a `turso::Error`, which
//! every caller reads as not having reached the remote. It carries no `status=`, so it is never
//! read as a refusal or as the database being gone (`turso/platform/mod.rs`). The engine's IO
//! thread keeps the request it was waiting on until the socket dies, so a later call on the same
//! engine runs out the same way, which is the offline case again.

use std::{
    future::Future,
    pin::Pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    task::{Context, Poll, Wake, Waker},
    time::Duration,
};

use tokio::time::{Instant, Sleep};

use crate::diagnostics;

/// How long a replica's push or pull waits, and for what.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Bound {
    /// how long the remote may say nothing at all before the call is given up.
    pub(crate) silence: Duration,
    /// how long the call may take whatever it is doing.
    pub(crate) ceiling: Duration,
}

/// Thirty seconds of silence, the number the Platform API's client waits
/// (`turso/platform/live.rs`), under a ten-minute ceiling.
pub(crate) const SYNC_BOUND: Bound = Bound {
    silence: Duration::from_secs(30),
    ceiling: Duration::from_secs(10 * 60),
};

/// Run one engine call under `bound`, answering an error where it runs out.
///
/// `what` names the call in the log line, which is all it is for.
pub(crate) async fn bounded<T>(
    bound: Bound,
    what: &'static str,
    call: impl Future<Output = Result<T, turso::Error>>,
) -> Result<T, turso::Error> {
    match Quiet::new(bound, call).await {
        Ok(answer) => answer,
        Err(ran_out) => {
            let (reason, after) = match ran_out {
                RanOut::Silence => ("silence", bound.silence),
                RanOut::Ceiling => ("ceiling", bound.ceiling),
            };

            diagnostics::warn("replica.sync.timedOut")
                .with("call", what)
                .with("reason", reason)
                .with("after_ms", after.as_millis().to_string())
                .write();

            Err(turso::Error::Error(format!(
                "the remote did not answer the replica's {what} within {} seconds",
                after.as_secs_f64()
            )))
        }
    }
}

/// Which limit a call ran into.
#[derive(Debug, PartialEq, Eq)]
enum RanOut {
    Silence,
    Ceiling,
}

/// What the call wakes when it makes progress: a mark that it moved, and the task waiting on it.
#[derive(Default)]
struct Progress {
    moved: AtomicBool,
    waiting: Mutex<Option<Waker>>,
}

impl Wake for Progress {
    fn wake(self: Arc<Self>) {
        self.wake_by_ref();
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.moved.store(true, Ordering::SeqCst);

        if let Some(waiting) = self
            .waiting
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
        {
            waiting.wake_by_ref();
        }
    }
}

/// A call that is given up after a silence or past a ceiling.
///
/// **A wake is what counts as progress.** The call is polled with a waker of this future's own,
/// so a wake from the engine marks it as having moved and restarts the silence, and only then
/// passes the wake on to the task. The timers wake the task directly, so they never count.
struct Quiet<F> {
    call: Pin<Box<F>>,
    progress: Arc<Progress>,
    waker: Waker,
    silence: Duration,
    quiet: Pin<Box<Sleep>>,
    ceiling: Pin<Box<Sleep>>,
}

impl<F> Quiet<F> {
    fn new(bound: Bound, call: F) -> Self {
        let progress = Arc::new(Progress::default());
        let now = Instant::now();

        Self {
            call: Box::pin(call),
            waker: Waker::from(Arc::clone(&progress)),
            progress,
            silence: bound.silence,
            quiet: Box::pin(tokio::time::sleep_until(now + bound.silence)),
            ceiling: Box::pin(tokio::time::sleep_until(now + bound.ceiling)),
        }
    }
}

impl<F: Future> Future for Quiet<F> {
    type Output = Result<F::Output, RanOut>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let this = &mut *self;

        *this
            .progress
            .waiting
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(cx.waker().clone());

        if let Poll::Ready(answer) = this
            .call
            .as_mut()
            .poll(&mut Context::from_waker(&this.waker))
        {
            return Poll::Ready(Ok(answer));
        }

        if this.progress.moved.swap(false, Ordering::SeqCst) {
            this.quiet.as_mut().reset(Instant::now() + this.silence);
        }

        if this.ceiling.as_mut().poll(cx).is_ready() {
            return Poll::Ready(Err(RanOut::Ceiling));
        }

        if this.quiet.as_mut().poll(cx).is_ready() {
            return Poll::Ready(Err(RanOut::Silence));
        }

        Poll::Pending
    }
}

#[cfg(test)]
mod tests {
    use super::{Bound, Quiet, RanOut, bounded};
    use std::{
        future::Future,
        pin::Pin,
        task::{Context, Poll},
        time::Duration,
    };
    use tokio::time::{Instant, Sleep};

    const BOUND: Bound = Bound {
        silence: Duration::from_millis(300),
        ceiling: Duration::from_secs(5),
    };

    /// A call that says something every `every` and answers after `steps` of them, the way the
    /// engine's IO thread wakes a pull at each chunk of a long body.
    struct Trickle {
        every: Duration,
        steps: u32,
        tick: Pin<Box<Sleep>>,
    }

    impl Trickle {
        fn new(every: Duration, steps: u32) -> Self {
            Self {
                every,
                steps,
                tick: Box::pin(tokio::time::sleep(every)),
            }
        }
    }

    impl Future for Trickle {
        type Output = Result<u32, turso::Error>;

        fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
            while self.tick.as_mut().poll(cx).is_ready() {
                if self.steps == 0 {
                    return Poll::Ready(Ok(7));
                }

                self.steps -= 1;
                let next = Instant::now() + self.every;
                self.tick.as_mut().reset(next);
            }

            Poll::Pending
        }
    }

    /// **A call that keeps moving is never cut by the silence**, however long it runs in all: two
    /// seconds of a chunk every 200 ms under a 300 ms silence answers.
    #[tokio::test]
    async fn a_call_that_keeps_making_progress_outlasts_the_silence() {
        let answer = bounded(BOUND, "pull", Trickle::new(Duration::from_millis(200), 10)).await;

        assert_eq!(answer.expect("a call that kept moving was given up"), 7);
    }

    /// **A call that says nothing is given up after the silence**, as an error the callers read as
    /// the offline case, and one that names no status so it is never read as a refusal.
    #[tokio::test]
    async fn a_silent_call_is_given_up_after_the_silence() {
        let started = Instant::now();
        let answer = bounded(BOUND, "pull", std::future::pending::<Result<(), _>>()).await;

        let error = answer.expect_err("a silent call was not given up");
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(!error.to_string().contains("status="));
        assert_eq!(crate::turso::platform::read_sync_refusal(&error), None);
        assert!(!crate::turso::platform::database_is_gone(&error));
    }

    /// **A call that trickles forever is given up at the ceiling**, which the silence alone would
    /// never reach.
    #[tokio::test]
    async fn a_call_that_never_finishes_is_given_up_at_the_ceiling() {
        let started = Instant::now();
        let answer = Quiet::new(
            Bound {
                silence: Duration::from_millis(300),
                ceiling: Duration::from_millis(900),
            },
            Trickle::new(Duration::from_millis(100), u32::MAX),
        )
        .await;

        assert_eq!(answer.err(), Some(RanOut::Ceiling));
        assert!(started.elapsed() < Duration::from_secs(2));
    }
}
