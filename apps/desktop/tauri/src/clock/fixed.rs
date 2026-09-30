//! the clock a test has: it answers one moment, whenever it is asked.

use std::sync::Arc;

use super::{Clock, Shared, Timestamp};

/// A clock stopped at a moment.
pub struct Fixed(pub Timestamp);

impl Fixed {
    /// This clock as the application holds one.
    pub fn shared(moment: Timestamp) -> Shared {
        Arc::new(Fixed(moment))
    }
}

impl Clock for Fixed {
    fn now(&self) -> Timestamp {
        self.0
    }
}
