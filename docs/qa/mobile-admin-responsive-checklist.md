# Mobile Admin responsive QA — manual device pass

Automated widget coverage checks the shared Admin status/action layouts at 320×640, 360×800, 390×844 and 430×932, plus 1.3× text scaling and keyboard insets. Those tests do **not** replace an authenticated Android device pass through all routes. No safe local Admin fixture/server was available for that full visual pass during this branch work.

Use a dedicated non-production Admin test account with permission variants: Super Admin, `view_moderation`-only Admin, `manage_moderation` Admin, and restricted Admin without moderation permissions. Do not use real personal documents in screenshots.

| Screen / flow | 320 | 360 | 390 | 430 | Keyboard / larger text | Check |
| --- | --- | --- | --- | --- | --- | --- |
| Admin login, error and recovery states | □ | □ | □ | □ | □ | No title/action clipping; form scrolls above keyboard |
| Dashboard and metric cards | □ | □ | □ | □ | □ | Long counts/labels wrap; actions reachable |
| Worker list/detail/approval dialogs | □ | □ | □ | □ | □ | Long names, status pills, private document links, reject confirmation |
| Company list/detail/approval dialogs | □ | □ | □ | □ | □ | Long company/contact text; optional company docs do not block approval |
| Orders list/detail and assignment selector | □ | □ | □ | □ | □ | Published zero-assignment order visible; first assignment action fits |
| Assignments list/detail/create/cancel | □ | □ | □ | □ | □ | Worker/order metadata wraps, destructive action separated |
| Attendance list/detail and QR/kiosk entry | □ | □ | □ | □ | □ | QR/status text, timestamps and IDs do not overflow |
| Reports and filter controls | □ | □ | □ | □ | □ | Filters/chips wrap; long labels remain readable |
| Notifications, including moderation push deep link | □ | □ | □ | □ | □ | Permission-aware destination and back navigation |
| Admin management/permissions | □ | □ | □ | □ | □ | Permission names and action buttons wrap cleanly |
| Moderation list/detail/status dialog | □ | □ | □ | □ | □ | Open/reviewing/resolved/dismissed, long report details, restricted Admin is read-only |
| Empty/loading/API error states across tabs | □ | □ | □ | □ | □ | Retry/empty text remains usable |

For every row also inspect normal and large Azerbaijani text, longest realistic worker/company/order values, landscape if supported, TalkBack labels where practical, and absence of `A RenderFlex overflowed by ...` logs. Capture emulator/device screenshots for any failure and record exact device size/text scale. This checklist remains open until a real authenticated mobile test environment is available.
