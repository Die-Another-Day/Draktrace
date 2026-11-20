# DarkTrace UI kit (Ateeb)

Import everything from one place:

```jsx
import { Card, Button, Badge, ProgressBar, Modal, Tooltip, Loader, ToastProvider, useToast } from '../components/ui';
```

Wrap the app once: `<ToastProvider><App /></ToastProvider>`.

| Component | Props |
|---|---|
| Card | title, subtitle, severity, glow, hoverable, onClick, actions, footer |
| Button | variant (primary, ghost, danger), size (sm, md, lg), loading, disabled, icon |
| Badge | severity (critical, high, medium, low) or status (running, paused, stopped, idle, online, offline), children, dot, pulse |
| ProgressBar | value 0-100, variant (accent, critical, high, medium, low), label, showValue, active, size (sm, md) |
| Modal | open, onClose, title, footer, size (sm, md, lg) |
| Tooltip | content, placement (top, bottom, left, right) |
| Loader | size (sm, md, lg), label |
| Toast | `const toast = useToast(); toast.success(msg)`; also error, warning, info; auto-dismiss 3 s |

Styles use only the shared theme variables (--accent, --sev-*, --bg-*, --fast, --base, --slow, etc.).
`src/demo/theme.fallback.css` holds temporary values; delete it once `theme.css` is merged.

## Extra components (security dashboard)

| Component | Props |
|---|---|
| StatCard | label, value (number counts up), unit, delta (%), upIsBad, trend (array for the mini chart), variant (accent, critical, high, medium, low) |
| ThreatGauge | value 0-100, label. 0-24 Low, 25-49 Medium, 50-74 High, 75-100 Critical |
| LogFeed | lines `[{ time, level: info/success/warn/error, text }]`, height, live, empty. Text is plain text, never HTML. |

## Behavior notes (v0.2)

- **Card:** buttons, links and inputs inside a clickable card keep their own behavior and do not also fire the card's `onClick`.
- **StatCard:** numbers count from the value already on screen, so live updates do not restart from 0.
- **LogFeed:** new lines scroll into view only while the reader is at the bottom. Scroll up to read; scroll back down to follow again.
- **Toast:** hovering or focusing a toast pauses its timer. Pass a longer time for important ones: `toast.error(msg, 6000)`.
- **Tooltip:** Esc hides it. It also shows on a disabled button. A tooltip inside a parent with `overflow: hidden` can be clipped; check this where you use it.
- **Fonts:** `index.html` loads Inter and JetBrains Mono for the demo. Remove that link if the shared `theme.css` loads them.
