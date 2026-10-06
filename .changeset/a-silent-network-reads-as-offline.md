---
'@rentable/desktop': patch
---

when the network takes a sync and never answers, the app now treats it as offline after 30 seconds instead of waiting for good, and the workspace keeps answering while a sync waits, including while it opens
