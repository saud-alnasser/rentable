//! the machine's own clock.

use std::{sync::Arc, time::SystemTime};

use super::{Clock, Shared, Timestamp, from};

/// The system clock. Holds nothing of its own: every read asks the machine.
pub struct System;

impl System {
    /// The system clock as the application holds it.
    pub fn shared() -> Shared {
        Arc::new(System)
    }
}

impl Clock for System {
    fn now(&self) -> Timestamp {
        from(SystemTime::now())
    }
}
