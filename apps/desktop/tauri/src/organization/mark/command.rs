//! the commands on the organization's mark: read, set from a file, and cleared.

use crate::{clock, error::Error, organization::Shared};

use crate::organization::{
    act::{Acting, Pull, as_member},
    mark,
};

/// The organization's mark, a signature or a seal, opened for the pages it is printed on and the
/// settings it is set in; nothing where none is set. Any signed-in member reads it, from the
/// replica, offline included.
#[tauri::command(rename = "mark_get")]
pub async fn organization_mark_get(
    app_state: tauri::State<'_, Shared>,
) -> Result<Option<mark::MarkFacts>, Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        mark::read_mark(store, member).await
    })
    .await
}

/// Keep the image at `path`, which the open dialog chose, as the organization's mark. It is read
/// here rather than handed over, checked by its bytes, sealed, written and sent; whoever carries
/// `manageMark` does it.
#[tauri::command(rename = "mark_set")]
pub async fn organization_mark_set(
    app_state: tauri::State<'_, Shared>,
    clock: tauri::State<'_, clock::Shared>,
    path: String,
) -> Result<mark::MarkFacts, Error> {
    let unreadable = |error: std::io::Error| Error::Io {
        message: format!("could not read {path}: {error}"),
    };

    // the size first, so a file far past the limit is refused without being read into memory.
    mark::check_length(tokio::fs::metadata(&path).await.map_err(unreadable)?.len())?;

    let image = tokio::fs::read(&path).await.map_err(unreadable)?;
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        mark::set_mark(store, member, &image, clock.now()).await
    })
    .await
}

/// Remove the organization's mark; whoever carries `manageMark` does it.
#[tauri::command(rename = "mark_clear")]
pub async fn organization_mark_clear(app_state: tauri::State<'_, Shared>) -> Result<(), Error> {
    as_member(&app_state, Pull::No, async |Acting { member, store }| {
        mark::clear_mark(store, member).await
    })
    .await
}
