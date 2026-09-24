---

---

# Hypothesis

In WebView2, a page that handles Ctrl+N in a capture-phase `keydown` listener and calls
`preventDefault()` receives the key, and WebView2 does not open a new window.

# Falsifier

A new window opens, or the page never sees the key.

# Experiment

On 2026-09-24, a prototype switcher `off` / `on`; `on` registered a capture-phase window `keydown`
listener that, on Ctrl or Cmd+N, called `preventDefault()` and raised the toast "page answered
ctrl+n". Pressed by the human in the running dev build on Windows.

# Observation

The human reported "create key is on": the page answered the key.

# Result

Confirmed on Windows (WebView2). WKWebView and WebKitGTK were not run.

# Conclusion

**Ctrl/Cmd+N is the create key**, registered through the shortcut registry like every other
application shortcut. The spec's open question on the key is closed. macOS and Linux are assumed to
deliver the key to the page, the ordinary behaviour of an embedded webview with no browser menu, and
are checked in the walk where a machine is available.

# Disposition of the code

Deleted with the worktree.
