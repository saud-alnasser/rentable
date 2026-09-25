//! Printing the page the web layer has put on its print sheet.
//!
//! The web layer draws what is to be printed, a receipt or a schedule, on the one print sheet the
//! window holds, and every other region of the page is hidden under `@media print`. This takes the
//! page from there to paper or to a file.
//!
//! **On Windows it never opens the webview's own print preview.** `window.print()` there opens
//! Edge's browser preview, which did not read as part of the application (effort 835, requirement
//! 10). WebView2 can do better on both counts: `PrintToPdf` writes the file the reader chose with
//! no dialog at all, and `ShowPrintUI` with the system kind opens the operating system's own print
//! dialog.
//!
//! **On macOS and Linux both modes open the system's print panel**, through Tauri's own
//! `Webview::print`. That panel is already the platform's, and its PDF option (*Save as PDF*,
//! *Print to File*) is how a file is saved there: writing one silently would take native code on
//! macOS this repository cannot compile off a Mac, and WebKitGTK has no reliable way to at all
//! (the effort's printing research, F3.2 and F3.3).

use serde::Deserialize;

use crate::error::Error;

/// What the reader asked of the page.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PrintMode {
    /// to paper, through the operating system's print dialog.
    Print,
    /// to a PDF file at the path the reader chose.
    Pdf,
}

/// How a PDF is laid out when WebView2 writes it.
#[derive(Debug, Clone, Copy, PartialEq)]
#[cfg_attr(not(windows), allow(dead_code))]
struct PdfPage {
    /// A4 in inches, as WebView2 takes it: A4 is what a receipt or a schedule is printed on here,
    /// and WebView2's own default is US Letter.
    width: f64,
    height: f64,
    /// the page draws its own surfaces, so they are printed.
    backgrounds: bool,
    /// the browser's title and address line are not part of the page.
    header_and_footer: bool,
}

#[cfg_attr(not(windows), allow(dead_code))]
const PDF_PAGE: PdfPage = PdfPage {
    width: 8.27,
    height: 11.69,
    backgrounds: true,
    header_and_footer: false,
};

/// Print the page on the sheet, or write it to `path` as a PDF.
///
/// Answers once the file is written, for a PDF, and once the dialog has been asked to open, for
/// paper: the dialog itself belongs to the operating system from there.
#[tauri::command]
pub async fn print_page<R: tauri::Runtime>(
    webview: tauri::Webview<R>,
    mode: PrintMode,
    path: Option<String>,
) -> Result<(), Error> {
    if mode == PrintMode::Pdf && path.as_deref().is_none_or(|path| path.trim().is_empty()) {
        return Err(Error::InvalidInput {
            message: "a PDF needs a file to be written to".into(),
        });
    }

    platform::print(webview, mode, path).await
}

#[cfg(windows)]
mod platform {
    use std::sync::{Arc, Mutex};

    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM, ICoreWebView2_2, ICoreWebView2_7, ICoreWebView2_16,
        ICoreWebView2Environment6,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{HSTRING, Interface};

    use super::{PDF_PAGE, PrintMode};
    use crate::error::Error;

    type Answer = Result<(), String>;

    /// the one answer a print gives, sent once from whichever of the call or its completion
    /// finishes it.
    #[derive(Clone)]
    struct Reply(Arc<Mutex<Option<tokio::sync::oneshot::Sender<Answer>>>>);

    impl Reply {
        fn send(&self, answer: Answer) {
            if let Some(sender) = self.0.lock().ok().and_then(|mut slot| slot.take()) {
                let _ = sender.send(answer);
            }
        }
    }

    pub async fn print<R: tauri::Runtime>(
        webview: tauri::Webview<R>,
        mode: PrintMode,
        path: Option<String>,
    ) -> Result<(), Error> {
        let (sender, receiver) = tokio::sync::oneshot::channel::<Answer>();
        let reply = Reply(Arc::new(Mutex::new(Some(sender))));
        let on_webview = reply.clone();

        webview
            .with_webview(move |platform| {
                // SAFETY: WebView2 is asked on the thread that owns it, which is the thread this
                // closure runs on, and the controller is the live one Tauri hands over.
                let started = unsafe { start(platform.controller(), mode, path, &on_webview) };

                if let Err(error) = started {
                    on_webview.send(Err(error.message()));
                }
            })
            .map_err(|error| failed(error.to_string()))?;

        // the webview's copies are the only senders left, so a webview torn down before it answers
        // closes the channel rather than leaving this waiting.
        drop(reply);

        let answer = receiver
            .await
            .map_err(|_| failed("the webview did not answer".into()))?;

        match (mode, answer) {
            (_, Ok(())) => Ok(()),
            (PrintMode::Pdf, Err(message)) => Err(Error::Io { message }),
            (PrintMode::Print, Err(message)) => Err(failed(message)),
        }
    }

    unsafe fn start(
        controller: webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
        mode: PrintMode,
        path: Option<String>,
        reply: &Reply,
    ) -> windows::core::Result<()> {
        // SAFETY: every call below is a COM call on the WebView2 thread (see `print`).
        let core = unsafe { controller.CoreWebView2()? };

        match mode {
            PrintMode::Print => {
                let core = core.cast::<ICoreWebView2_16>()?;

                unsafe { core.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM)? };
                reply.send(Ok(()));
            }
            PrintMode::Pdf => {
                let environment = unsafe { core.cast::<ICoreWebView2_2>()?.Environment()? }
                    .cast::<ICoreWebView2Environment6>()?;
                let settings = unsafe { environment.CreatePrintSettings()? };

                unsafe {
                    settings.SetPageWidth(PDF_PAGE.width)?;
                    settings.SetPageHeight(PDF_PAGE.height)?;
                    settings.SetShouldPrintBackgrounds(PDF_PAGE.backgrounds)?;
                    settings.SetShouldPrintHeaderAndFooter(PDF_PAGE.header_and_footer)?;
                }

                let completed = reply.clone();
                let handler =
                    PrintToPdfCompletedHandler::create(Box::new(move |result, written| {
                        completed.send(match result.map(|_| written) {
                            Ok(true) => Ok(()),
                            Ok(false) => Err("the PDF could not be written".into()),
                            Err(error) => Err(error.message()),
                        });

                        Ok(())
                    }));
                let path = HSTRING::from(path.unwrap_or_default());

                unsafe {
                    core.cast::<ICoreWebView2_7>()?
                        .PrintToPdf(&path, &settings, &handler)?
                };
            }
        }

        Ok(())
    }

    /// the webview could not be asked, or could not do what it was asked: nothing on disk failed.
    fn failed(message: String) -> Error {
        Error::Internal { message }
    }
}

#[cfg(not(windows))]
mod platform {
    use super::PrintMode;
    use crate::error::Error;

    pub async fn print<R: tauri::Runtime>(
        webview: tauri::Webview<R>,
        _mode: PrintMode,
        _path: Option<String>,
    ) -> Result<(), Error> {
        webview.print().map_err(|error| Error::Internal {
            message: error.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_modes_are_read_as_the_web_layer_names_them() {
        assert_eq!(
            serde_json::from_str::<PrintMode>("\"print\"").unwrap(),
            PrintMode::Print
        );
        assert_eq!(
            serde_json::from_str::<PrintMode>("\"pdf\"").unwrap(),
            PrintMode::Pdf
        );
        assert!(serde_json::from_str::<PrintMode>("\"paper\"").is_err());
    }

    #[test]
    fn a_pdf_is_written_on_a4_with_its_surfaces_and_without_the_browsers_lines() {
        assert!((PDF_PAGE.width - 210.0 / 25.4).abs() < 0.01);
        assert!((PDF_PAGE.height - 297.0 / 25.4).abs() < 0.01);
        assert_eq!(
            (PDF_PAGE.backgrounds, PDF_PAGE.header_and_footer),
            (true, false)
        );
    }
}
