# SET Service iOS manual QA matrix

Status: **PENDING MACOS/REAL-DEVICE EXECUTION**. Use the final reviewed SHA and disposable approved accounts. Do not test against production data or real worker health/criminal documents.

| Area | Test cases | Pass evidence |
| --- | --- | --- |
| Worker authentication | Login, pending/rejected status, expired session, logout and app restart | Correct status screen; protected routes remain blocked; tokens/session cleared |
| Worker profile | Name/photo, work history, CV and required health/criminal documents | Long names wrap; private documents open only when authorized; no raw storage key |
| Worker assignment | Assignment list/detail, accepted assignment, rating view and report order/company/rating | Correct visibility and authorization; report confirmation is clear |
| Worker QR | Camera allow, denial, retry/settings path or manual fallback, accepted check-in/out | No crash; backend validates token and assignment; camera frames are not uploaded |
| Worker notifications | Permission allow/deny, foreground, background and tap/deep link | No crash; role-safe destination; token cleanup on logout/deletion |
| Worker privacy | Privacy, Terms, account deletion confirmation and completion | In-app deletion is easy to find; session revoked; consequences explained |
| Company authentication | Login, pending approval, rejected/suspended status, logout and restart | Dashboard/orders remain blocked until approved |
| Company orders | Create/view active order, zero assignments, first assignment context and QR creation | Newly created order appears; QR pre-assignment works where allowed |
| Company assignments | Assignment list/detail, worker profile and attendance | Only permitted worker fields/documents are visible |
| Company rating/reporting | Rate/report worker profile or content | Server authorization enforced; invalid target rejected |
| Company privacy | Privacy, Terms, account deletion confirmation and completion | Deletion action is reachable from More → privacy/account; session revoked |
| Admin dashboard | Dashboard, workers, companies, orders, assignments, attendance, reports and notifications | Cards/tables fit; status pills and actions do not overflow |
| Admin moderation | List, detail, status filter, reviewing, resolve, dismiss and resolution notes | Permission-limited Admin cannot perform unauthorized transitions |
| Accessibility/layout | iPhone SE/narrow width, modern iPhone, iPad, Dynamic Type, keyboard, dialogs and bottom sheets | No clipped text, hidden destructive action or keyboard-covered required control |
| Network/lifecycle | Cold start, app restart, offline API, retry and background/foreground transitions | Safe error/empty states; no stale protected data after logout/deletion |

Record device model, iOS version, orientation, text scale, build SHA and screenshots for every failure. Automated Flutter widget tests cover 320/360/390/430px responsive cases, but do not replace this signed real-device pass.
