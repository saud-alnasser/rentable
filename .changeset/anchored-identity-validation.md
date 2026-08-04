---
'rentable': patch
---

a national identity number is now accepted only when the whole value is one, so a padded or embedded number such as `!1234567890!` is refused where it was previously saved. surrounding whitespace is removed before the check, so an existing tenant stored with padding can still be opened and saved.
