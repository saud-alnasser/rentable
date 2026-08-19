//! how this application reaches the network.
//!
//! One place, because the TLS backend has to be chosen once and identically.
//! reqwest is built here against `rustls-no-provider` so the tree carries a
//! single crypto provider rather than pulling `aws-lc-rs` in beside the `ring`
//! it already has; the cost of that choice is that a provider must be installed
//! before any client is built, or building one panics rather than failing.

use std::time::Duration;

use crate::error::Error;

/// an HTTPS client that abandons a request after `timeout`.
pub(crate) fn build_client(timeout: Duration) -> Result<reqwest::Client, Error> {
    install_crypto_provider();

    reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|error| Error::Internal {
            message: format!("failed to build an https client: {error}"),
        })
}

/// install the crypto provider every rustls client in this process shares.
///
/// Idempotent, and called from each construction site rather than once at
/// startup: a client built before a startup step had run would panic, and
/// nothing in the type system would have said so.
pub(crate) fn install_crypto_provider() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        // this fails only where another thread installed one in the meantime,
        // which is the outcome the call wanted anyway.
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    /// building a client panics rather than failing when no crypto provider is
    /// installed, so every network path in the application depends on this one
    /// call having happened. Nothing else would catch its removal.
    #[test]
    fn a_client_can_be_built_without_a_provider_having_been_installed_first() {
        super::build_client(Duration::from_secs(1)).expect("failed to build an https client");
    }

    /// installing twice is what happens in practice: each construction site
    /// calls it, and the second must not panic on the first one's provider.
    #[test]
    fn building_a_second_client_is_not_a_second_installation() {
        super::build_client(Duration::from_secs(1)).expect("failed to build the first client");
        super::build_client(Duration::from_secs(1)).expect("failed to build the second client");
    }
}
