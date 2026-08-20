---
'@rentable/desktop': patch
---

internal: everything the application does between the process starting and a person being able to use it now lives in one unit that can be run without a window, and the eight ways a launch can go are covered by tests rather than by launching the application eight times. nothing about what a launch does has changed
