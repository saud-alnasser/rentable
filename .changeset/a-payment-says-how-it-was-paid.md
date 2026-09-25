---
'@rentable/desktop': patch
---

a payment can say how it was paid (cash, bank transfer, cheque or Ejar), carry the transfer, cheque or SADAD number it was made under, and hold a note. all three are optional, set on the payment form and shown on its record, and a payment recorded before them says its method is not recorded. searching a contract's payments or the command menu finds a payment by any part of its reference, and undo takes back an edit to any of the three. this raises the workspace schema to version 5: once any member opens a workspace on this version, a machine still on an older one refuses to open it and asks to be updated
