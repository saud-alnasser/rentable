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

/// The page itself, as the web layer drew it on its print sheet: the stylesheets it is drawn
/// with, its language and direction, and the sheet's markup.
#[derive(Debug, Clone, Deserialize)]
#[cfg_attr(not(windows), allow(dead_code))]
pub struct PrintedPage {
    head: String,
    lang: String,
    dir: String,
    body: String,
}

/// Print the page on the sheet, or write it to `path` as a PDF.
///
/// **On Windows, from a window nobody sees**, where `page` is given: printing lays a window out for
/// paper, and the main window printing itself showed that for a moment, light and the page alone
/// (effort 835, requirement 10). The page is drawn in a print window behind the application and
/// printed from there, so the application never changes on screen.
///
/// Answers once the file is written, for a PDF, and once the dialog is done with the page, for
/// paper.
#[tauri::command]
pub async fn print_page<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    webview: tauri::Webview<R>,
    mode: PrintMode,
    path: Option<String>,
    page: Option<PrintedPage>,
) -> Result<(), Error> {
    if mode == PrintMode::Pdf && path.as_deref().is_none_or(|path| path.trim().is_empty()) {
        return Err(Error::InvalidInput {
            message: "a PDF needs a file to be written to".into(),
        });
    }

    platform::print(app, webview, mode, path, page).await
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

    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::Duration;

    use tauri::webview::PlatformWebview;
    use webview2_com::ExecuteScriptCompletedHandler;

    use super::{PDF_PAGE, PrintMode, PrintedPage};
    use crate::error::Error;

    /// what the print window loads: a blank page that draws what it is handed (`static/print.html`).
    const PRINT_PAGE: &str = "print.html";

    /// how long the print window is given to load and draw the page before it is given up on.
    const READY_WITHIN: Duration = Duration::from_secs(15);

    /// how long a print dialog may stay open before the window behind it is closed anyway.
    const PRINTED_WITHIN: Duration = Duration::from_secs(30 * 60);

    /// how often the print window is asked whether it is there yet.
    const POLL: Duration = Duration::from_millis(50);

    static PRINT_WINDOWS: AtomicU64 = AtomicU64::new(0);

    /// what reaches a WebView2 on its own thread: the application's webview, or a print window's.
    type Dispatch<'a> =
        Box<dyn FnOnce(Box<dyn FnOnce(PlatformWebview) + Send>) -> tauri::Result<()> + Send + 'a>;

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
        app: tauri::AppHandle<R>,
        webview: tauri::Webview<R>,
        mode: PrintMode,
        path: Option<String>,
        page: Option<PrintedPage>,
    ) -> Result<(), Error> {
        match page {
            Some(page) => print_elsewhere(&app, &webview, mode, path, page).await,
            None => print_on(Box::new(|run| webview.with_webview(run)), mode, path).await,
        }
    }

    /// Draw the page in a print window behind the application, print it from there, and close it.
    ///
    /// **Behind the application, where it stands**, rather than off screen or hidden: the
    /// operating system's print dialog opens over the window that asked for it, so it has to be
    /// where the reader is looking, and a webview that is not shown may lay nothing out. It takes
    /// no focus, no taskbar entry and no frame, and sits below every other window.
    async fn print_elsewhere<R: tauri::Runtime>(
        app: &tauri::AppHandle<R>,
        webview: &tauri::Webview<R>,
        mode: PrintMode,
        path: Option<String>,
        page: PrintedPage,
    ) -> Result<(), Error> {
        let main = webview.window();
        let position = main
            .outer_position()
            .map_err(|error| failed(error.to_string()))?;
        let size = main
            .outer_size()
            .map_err(|error| failed(error.to_string()))?;
        let label = format!("print-{}", PRINT_WINDOWS.fetch_add(1, Ordering::Relaxed));
        let window = tauri::WebviewWindowBuilder::new(
            app,
            &label,
            tauri::WebviewUrl::App(PRINT_PAGE.into()),
        )
        .visible(false)
        .focused(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_bottom(true)
        .resizable(false)
        .build()
        .map_err(|error| failed(error.to_string()))?;

        let printed = async {
            window
                .set_position(position)
                .and_then(|_| window.set_size(size))
                .and_then(|_| window.show())
                .map_err(|error| failed(error.to_string()))?;

            wait_for(
                &window,
                "typeof window.__rentableDraw === 'function'",
                READY_WITHIN,
            )
            .await?;

            let draw = format!(
                "window.__rentableDraw({}, {}, {}, {})",
                json(&page.head),
                json(&page.lang),
                json(&page.dir),
                json(&page.body)
            );

            evaluate(&window, draw).await?;
            wait_for(&window, "window.__rentableReady === true", READY_WITHIN).await?;
            print_on(Box::new(|run| window.with_webview(run)), mode, path).await?;

            // paper is done when the dialog is; a file already was when the host answered.
            if mode == PrintMode::Print {
                let _ =
                    wait_for(&window, "window.__rentablePrinted === true", PRINTED_WITHIN).await;
            }

            Ok(())
        }
        .await;

        let _ = window.close();

        printed
    }

    /// Ask until `condition` holds in the window, or give up after `within`.
    async fn wait_for<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
        condition: &str,
        within: Duration,
    ) -> Result<(), Error> {
        let deadline = tokio::time::Instant::now() + within;

        loop {
            if evaluate(window, condition.to_string()).await? == "true" {
                return Ok(());
            }

            if tokio::time::Instant::now() >= deadline {
                return Err(failed(format!(
                    "the print window never answered {condition}"
                )));
            }

            tokio::time::sleep(POLL).await;
        }
    }

    /// Run `script` in the window and answer with what it evaluated to, as JSON.
    async fn evaluate<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
        script: String,
    ) -> Result<String, Error> {
        type Answered = Arc<Mutex<Option<tokio::sync::oneshot::Sender<Result<String, String>>>>>;

        let (sender, receiver) = tokio::sync::oneshot::channel::<Result<String, String>>();
        let sender: Answered = Arc::new(Mutex::new(Some(sender)));
        let on_webview = Arc::clone(&sender);

        window
            .with_webview(move |platform| {
                let answer = |slot: &Answered, result: Result<String, String>| {
                    if let Some(sender) = slot.lock().ok().and_then(|mut slot| slot.take()) {
                        let _ = sender.send(result);
                    }
                };
                let answered = Arc::clone(&on_webview);
                // SAFETY: COM calls on the WebView2 thread, which this closure runs on.
                let started = unsafe {
                    platform.controller().CoreWebView2().and_then(|core| {
                        core.ExecuteScript(
                            &HSTRING::from(script),
                            &ExecuteScriptCompletedHandler::create(Box::new(
                                move |result, value| {
                                    answer(
                                        &answered,
                                        result.map(|_| value).map_err(|e| e.message()),
                                    );

                                    Ok(())
                                },
                            )),
                        )
                    })
                };

                if let Err(error) = started {
                    answer(&on_webview, Err(error.message()));
                }
            })
            .map_err(|error| failed(error.to_string()))?;

        drop(sender);

        receiver
            .await
            .map_err(|_| failed("the print window did not answer".into()))?
            .map_err(failed)
    }

    fn json(text: &str) -> String {
        serde_json::to_string(text).unwrap_or_else(|_| String::from("\"\""))
    }

    /// Print what the webview `dispatch` reaches holds, on its own thread.
    async fn print_on(
        dispatch: Dispatch<'_>,
        mode: PrintMode,
        path: Option<String>,
    ) -> Result<(), Error> {
        let (sender, receiver) = tokio::sync::oneshot::channel::<Answer>();
        let reply = Reply(Arc::new(Mutex::new(Some(sender))));
        let on_webview = reply.clone();

        dispatch(Box::new(move |platform| {
            // SAFETY: WebView2 is asked on the thread that owns it, which is the thread this
            // closure runs on, and the controller is the live one Tauri hands over.
            let started = unsafe { start(platform.controller(), mode, path, &on_webview) };

            if let Err(error) = started {
                on_webview.send(Err(error.message()));
            }
        }))
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
        _app: tauri::AppHandle<R>,
        webview: tauri::Webview<R>,
        _mode: PrintMode,
        _path: Option<String>,
        _page: Option<super::PrintedPage>,
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
