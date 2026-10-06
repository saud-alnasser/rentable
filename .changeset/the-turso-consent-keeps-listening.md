---
'@rentable/desktop': patch
---

connecting a Turso account no longer fails on Windows when the browser opens a connection before it sends anything, or sends its answer in pieces: the app keeps waiting for Turso's answer. a page that is not Turso answering this connection can no longer end it, and whatever Turso says when it refuses is shown in the browser as plain text.
