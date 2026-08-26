# Maximum Update Depth Debug Report

**Subject:** `Maximum update depth exceeded` thrown when signing in after a fresh app launch
**Status:** Investigation only — **no application code was changed**
**Repo state at time of investigation:** branch `main`, commit `134bdfe`, working tree clean
**Companion artifact:** https://claude.ai/code/artifact/28dfdc83-2808-41b8-a6c1-4812390a4e46

### Environment

| | |
|---|---|
| `expo` | `~55.0.28` |
| `expo-router` | `~55.0.17` |
| `@react-navigation/native` | `^7.1.33` |
| `react` | `19.2.0` |
| `react-native` | `0.83.10` |
| `expo-secure-store` | `~55.0.16` |
| Config | plain `app.json`, `expo-router` plugin, no `app.config.*`, no `router` extra (no redirects/rewrites configured) |

### How to read the confidence labels

Every finding in this report carries one of these labels. **Do not upgrade a label without new evidence.**

| Label | Meaning |
|---|---|
| **PROVEN** | Verified by reading the actual source in this repo or in `node_modules/expo-router/build`. |
| **LEADING CANDIDATE** | Structurally consistent with all evidence, but one link is not yet confirmed from a runtime log. |
| **POSSIBLE** | Plausible contributing factor; not demonstrated. |
| **RULED OUT** | Actively checked and eliminated, with the evidence recorded. |
| **NEEDS VERIFICATION** | Requires a device run to settle. |

---

## 1. Problem Summary

The app has **three independent authorities that can move the authentication boundary**, and none of them is aware of the others:

1. `AuthGuard` — imperative, navigates from inside a `useEffect`.
2. `src/app/index.tsx` — declarative, renders two `<Redirect>` elements.
3. Individual screens calling `router.replace()` directly — `LoginForm`, `splash`, `profile` logout, `switch-account`, `SavedAccountsStrip`.

In `expo-router@55`, **every** `router.*` call synchronously schedules a React update on the app's root component. When such a call originates inside an effect, it is an update scheduled during the commit phase. React counts these, and roughly **50 chained effect-driven navigations throw `Maximum update depth exceeded`** — whether or not the chain is strictly infinite.

The cold-start-vs-warm difference is real, and it is **a difference in the shape of the root navigation stack, not in auth state**. `unstable_settings.initialRouteName = "splash"` makes `splash` an *anchor* route that exists at the bottom of the stack only in the launch state. That one difference changes what `router.canDismiss()` returns, and therefore which branches of `AuthGuard` execute.

**The original hypothesis — that `AuthGuard` re-fires `router.replace("/")` — is plausible but is not the whole story, and the reported stack trace does not prove it on its own.** `AuthGuard`'s `redirectedRef` is a *re-armable* latch, so it *can* fire repeatedly, but only if a second authority keeps navigating back into a protected route. Section 9 names the suspected counterparty and the one log line that settles it.

---

## 2. Exact Reproduction Steps

### Scenario A — works (baseline, must not regress)

1. Open the development app in Expo Go.
2. An account is already logged in.
3. Log out.
4. Log back in.
5. Login succeeds; the app is usable.

### Scenario B — bug

1. Log out.
2. Completely close the app / Expo Go.
3. Reopen the app using the Expo QR code.
4. Log in again.
5. Login initially succeeds.
6. The app throws `Maximum update depth exceeded`.
7. The user cannot properly continue into the app.

---

## 3. Observed Behavior

Reported error and stack (excerpt supplied by the reporter):

```text
[AuthGuard] router.replace("/")
ERROR  Maximum update depth exceeded

...
routingQueue.add
linkTo
replace
useEffect$argument_0 (src/components/AuthGuard.tsx)
...
RootLayout (src/app/_layout.tsx)
```

**Interpretation (PROVEN):** React throws this error from `checkForNestedUpdates` at the point of the offending state update. The JS frames below `routingQueue.add` are simply whatever called it. **The stack therefore names the frame that tripped the counter, not necessarily the sole driver of the chain.**

**Important caveat preserved from the investigation:** the reporter's excerpt shows `[AuthGuard] router.replace("/")` appearing *once*. If it truly appears only once in the full log, `AuthGuard` is a passenger in a cascade driven elsewhere. If it appears many times, `AuthGuard` is an active participant in the cycle. **This has not yet been checked and is the single most valuable next data point** (see Section 14).

---

## 4. Expected Behavior

- Cold launch with no session → splash animation → login screen → sign in → dashboard, with no crash.
- The auth boundary should be crossed by exactly one navigation per auth transition.
- The behaviour should be identical whether or not the app was closed beforehand.

---

## 5. Authentication / Session Flow

### 5.1 App startup

- `src/app/_layout.tsx` runs `SplashScreen.preventAutoHideAsync()` and `applyMontserratDefault()` at module scope.
- `RootLayout` mounts with `sessionRestored = false` and **returns `null`** — so there is no navigator, no `AuthGuard`, and no store subscribers at first render. (See finding **F7**.)
- One effect (`_layout.tsx:42-54`) runs:
  ```
  Promise.all([
    restoreSavedAccounts → restoreSession → restoreTimeframeSelection → validateStoredSession,
    applyStoredTheme,
    restoreActiveLocation,
  ]).finally(() => setSessionRestored(true))
  ```
- User state starts `null`. The gate is `sessionRestored && fontsLoaded`. **There is no separate `isLoading` / `isHydrating` / `initializing` flag exposed to consumers** — the shell simply renders nothing.
- The persisted session is read in `restoreSession()` (`src/lib/session.ts:106-135`) from `expo-secure-store`. A restored session is given a **fresh** TTL window — a lapse that happened while the app was closed is deliberately *not* treated as expiry.

### 5.2 Login

- `LoginForm.handleSubmit` (`src/components/auth/LoginForm.tsx:82-125`):
  `login()` → `await setSession(token, user)` → `await restoreTimeframeSelection()` → `router.replace("/home")`.
- `setSession` writes in-memory state **synchronously**, awaits three SecureStore writes, then calls `notify()`. Navigation therefore happens *after* auth state has settled. **This ordering is correct and is not the bug.**
- Login triggers **at least three** store notifications:
  - `upsertSavedAccount` → `commit()` → `emit()`
  - `resetActiveLocation()` (because `accountChanged` is true when `authUser` was `null`) and `metricsCacheService.clearAllCaches()`
  - `session.notify()`
  - then `restoreTimeframeSelection()` → `emit()`
- **Login navigates imperatively; it does not rely on `AuthGuard`.** `AuthGuard` has no "authed on a public route → go to `/home`" rule at all — that job belongs to `index.tsx`'s `<Redirect href="/home" />`. **Two components own opposite halves of one boundary.**

### 5.3 Logout

- `src/app/(tabs)/profile.tsx:374-382` → `await signOut()` then `router.replace("/")` inside a `finally`.
- `signOut()` (`src/services/auth.ts:223-234`): deregisters push → revokes the token → `markAccountSignInRequired(userId)` → `clearSession()`.
- `clearSession()` nulls in-memory state, calls `resetActiveLocation()`, deletes three SecureStore keys, then `notify()`.
- **Two redirects race:** `AuthGuard` fires on the `notify()` (because `/profile` is protected), and `profile.tsx` fires its own `replace("/")`. Both target the same public route, so today they merely duplicate work.
- Nothing is restored afterwards. `endReason` stays `null` for an intentional sign-out, so the login screen shows no "session expired" notice.

### 5.4 Fresh app launch

- **No session:** `restoreSession()` returns `false` and calls `clearSession()`; splash plays; login screen.
- **Existing session:** restored, then `validateStoredSession()` performs a raw `GET /api/user` with an 8 s timeout — a 401 tears the session down, a network error keeps it. Splash still plays first, then `index` mounts with `authedAtMount = true` and redirects to `/home`.
- **After logout then reopen:** see Section 13.
- **Race between hydration and router init:** **yes** — finding **F7**. The navigator does not exist during hydration, and any navigation issued in that window is dropped by `assertIsReady()` inside `routingQueue.run()`.

---

## 6. Relevant Files and Components

### 6.1 Component tree (actual, from the installed router source down through the app)

```
ExpoRoot                                   build/ExpoRoot.js
└── NavigationContainer (fork)             build/fork/NavigationContainer.js
    │   └── useImperativeApiEmitter(ref)   ← every router.* call re-renders HERE  (F1)
    └── BaseNavigationContainer
        └── Content()                      internal slot StackRouter, id "__root"
            └── Screen "__root"            ← useRootNavigationState() reports THIS navigator (F8)
                └── RootLayout             src/app/_layout.tsx
                    │
                    ├── (returns null until sessionRestored && fontsLoaded)   F7
                    │
                    └── GestureHandlerRootView
                        ├── StatusBar
                        ├── AuthGuard             → dismissAll() + replace("/")   ── authority #1
                        ├── PushDeviceRegistrar
                        ├── PushNotificationRouter → router.navigate(), capped at 3
                        ├── <Stack>  screenOptions=stackScreenOptions(colorScheme)
                        │        screenLayout=screenEnterLayout
                        │   ├── Screen "splash"     AUTH_SCREEN_OPTIONS   anchor (initialRouteName)
                        │   ├── Screen "index"      AUTH_SCREEN_OPTIONS   → <Redirect> ×2 ── authority #2
                        │   ├── Screen "(tabs)"     AUTH_SCREEN_OPTIONS
                        │   └── Screen "switch-account"
                        │       └── (all other module routes, implicit)
                        └── AppUpdateGate
```

### 6.2 Files inspected

| File | Role |
|---|---|
| `src/components/AuthGuard.tsx` | The imperative auth redirect; three effects; `redirectedRef` |
| `src/app/_layout.tsx` | Root layout, hydration gate, `unstable_settings`, `<Stack>` |
| `src/app/index.tsx` | Login screen; two `<Redirect>`s; `authedAtMount` snapshot |
| `src/app/splash.tsx` | Splash animation and hand-off `replace("/")` |
| `src/app/(tabs)/_layout.tsx` | Tabs; role-driven tab set; no navigation |
| `src/app/(tabs)/profile.tsx` | Logout: `signOut()` then `replace("/")` |
| `src/app/switch-account.tsx` | Account-switch bridge; `replace("/home")` or `replace("/")` |
| `src/lib/session.ts` | Module-singleton session store, SecureStore persistence, `useSyncExternalStore` hooks |
| `src/lib/navigation/publicRoutes.ts` | `isPublicRoute()` — shared with `AppUpdateGate` |
| `src/lib/splashState.ts` | Module flag `played` driving the splash redirect |
| `src/services/auth.ts` | `login`, `validateStoredSession`, `revokeToken`, `signOut` |
| `src/lib/api.ts` | `apiRequest`, 401 → `handleUnauthorized()`, `neverSettles` |
| `src/components/auth/LoginForm.tsx` | Submit handler and post-login `replace("/home")` |
| `src/components/auth/SavedAccountsStrip.tsx` | `replace("/switch-account")` |
| `src/lib/accounts/savedAccountsStore.ts` | Saved-accounts store + SecureStore |
| `src/lib/accounts/switchAccount.ts` | `prepareAccountSwitch` / `commitPendingSwitch` |
| `src/lib/location/activeLocationStore.ts` | Reactive store (checked for snapshot stability) |
| `src/lib/dashboard/timeframeStore.ts` | Reactive store (checked for snapshot stability) |
| `src/components/PushNotificationRouter.tsx` | Cold-start push tap navigation |
| `src/lib/notifications/pushNavigationQueue.ts` | park → claim → settle queue, attempt cap |
| `src/lib/notifications/pushDevice.ts` | Push registration; Expo Go / Android guard |
| `src/components/PushDeviceRegistrar.tsx` | No navigation |
| `src/components/AppUpdateGate.tsx` | Second consumer of `isPublicRoute` |
| `src/lib/hooks/useAppUpdateCheck.ts` | Launch version check |
| `src/lib/hooks/useTransientAlert.ts` | Checked for effect-loop hazard |
| `src/components/navigation/QuickNavFab.tsx` | No navigation |
| `src/components/navigation/ScreenEnter.tsx` | `screenLayout` wrapper for every route |

### 6.3 Router internals read (`node_modules/expo-router/build`)

`global-state/routing.js`, `global-state/router-store.js`, `global-state/routeInfo.js`, `imperative-api.js`, `ExpoRoot.js`, `fork/NavigationContainer.js`, `hooks.js`, `useFocusEffect.js`, `link/Redirect.js`, `views/Protected.js`, `layouts/StackClient.js`.

---

## 7. Investigation Findings

### The mechanism — **PROVEN**

Every navigation goes through `routingQueue.add()`, which pushes the action and then **synchronously calls its subscribers**:

```js
// node_modules/expo-router/build/global-state/routing.js:79-84
add(action) {
    routingQueue.queue.push(action);
    for (const callback of routingQueue.subscribers) {
        callback();                       // ← synchronous React update
    }
},

// routing.js:128-130 — replace() is just linkTo(), and linkTo() ends at add()
function replace(url, options) {
    return linkTo(resolveHref(url), { ...options, event: 'REPLACE' });
}
```

The only subscriber is a `useSyncExternalStore` living in the app's root-most component:

```js
// build/imperative-api.js:24-30
function useImperativeApiEmitter(ref) {
    const events = useSyncExternalStore(
        routingQueue.subscribe, routingQueue.snapshot, routingQueue.snapshot);
    useEffect(() => { routingQueue.run(ref); }, [events, ref]);
}

// build/fork/NavigationContainer.js:41 — mounted in NavigationContainerInner,
// which wraps BaseNavigationContainer → the entire app tree.
useImperativeApiEmitter(refContainer);
```

So `router.replace()` called from inside a `useEffect` is, in React's accounting, a `setState` on the root fiber scheduled during a commit. React increments `nestedUpdateCount` for each such chained update and throws at 50.

---

### F1 — Effect-driven navigation is counted as a nested React update — **PROVEN**

Mechanism above.

**Consequence:** the app does not need a truly infinite loop to crash — roughly 50 chained navigations issued from effects is enough. Any ping-pong between two navigation authorities reaches that within a few frames.

---

### F2 — `<Redirect>` re-fires `router.replace()` on every render while focused — **PROVEN**

`build/link/Redirect.js` passes an **inline, non-memoized arrow** to `useFocusEffect`, and `build/useFocusEffect.js:162` declares `[effect, navigation, optionalNavigation]` as its dependency array. A new closure every render means the effect tears down and re-runs every render — issuing another `router.replace(href)` each time.

`src/app/index.tsx` renders **two** of these:

- `<Redirect href="/splash" />` at line 120
- `<Redirect href="/home" />` at line 126

The login route therefore hosts a per-render navigation engine. This is consistent with the existing project memory note *"Redirect vs imperative-nav race"*.

---

### F3 — `redirectedRef` is a re-armable latch, not a one-shot — **PROVEN**

`src/components/AuthGuard.tsx:40-43` resets `redirectedRef.current = false` on **any** effect run where `authed || isPublic`. Since the redirect's own destination (`"/"`) *is* public, the very next effect run re-arms the latch.

**It can therefore only collapse consecutive identical redirects — it cannot break a ping-pong between a public and a protected route.** The in-code comment claiming the ref "fires it once" is true only within one uninterrupted episode.

---

### F4 — `authedAtMount` can contradict live auth state — **PROVEN (mechanism) / LEADING CANDIDATE (as the loop counterparty)**

`src/app/index.tsx:88`:

```tsx
const [authedAtMount] = useState(() => isAuthenticated());
```

This is a **mount snapshot**. If the session dies while that `index` instance is still mounted, the screen keeps rendering `<Redirect href="/home" />` — a protected route — while `AuthGuard` keeps pushing back to `/`.

This is precisely the contradictory intermediate state the investigation was asked to look for: `authToken = null` while `authedAtMount = true`. Combined with **F2** (fires every render) and **F3** (latch re-arms on the public route), **this is the complete ping-pong shape, and it is the leading candidate for the loop.**

> **Uncertainty preserved:** the *mechanism* is proven from the code. What is **not** proven is that this particular instance is what closes the cycle in the reporter's run — that depends on whether the session is torn down after login (see Section 9 and Section 14).

---

### F5 — Cold and warm start produce different root-stack shapes — **PROVEN**

`unstable_settings.initialRouteName = "splash"` (`_layout.tsx:31`) makes `splash` an *anchor*: `getStateFromPath` prepends it, so the launch state is `[splash, index]`. A later `REPLACE` only consumes the last route of the computed state, so **the anchor is never re-added**.

- **Cold:** `[splash, index]` → index's `<Redirect href="/splash">` REPLACEs index → `[splash(A), splash(B)]` (*splash mounts twice*, matching the existing project memory note about the cold-start push nav contract) → B hands off → `[splash(A), index]` → after login `[splash(A), (tabs)]`. **Two routes.**
- **Warm:** the previous logout ran `AuthGuard`'s `dismissAll()` + `replace("/")`, consuming the anchor → `[index]` → after login `[(tabs)]`. **One route.**

`router.canDismiss()` (`routing.js:158-173`) walks the state for a stack with `routes.length > 1`. It is therefore **true on cold start and false on warm start** — so `AuthGuard`'s `dismissAll()` branch executes only in the cold-start shape, adding a second queued action whose intermediate state focuses `splash`.

**This is the concrete, verifiable cold/warm divergence.**

---

### F6 — `splash(A)` stays mounted all session with its hand-off flag unset — **PROVEN, latent**

`src/app/splash.tsx:55`:

```tsx
if (handedOffRef.current || !focusedRef.current) return;   // returns BEFORE setting the flag
handedOffRef.current = true;
```

The unfocused anchor instance `splash(A)` therefore ends its life with `handedOffRef === false` and remains mounted beneath the whole cold-start session, re-focusable by any `POP_TO_TOP`. Its one-shot `setTimeout` has already fired, so **it cannot navigate again as the code stands today** — but it is dead weight sitting directly under the auth boundary and one refactor away from being armed.

---

### F7 — `RootLayout` renders `null` before any navigator exists — **PROVEN**

`src/app/_layout.tsx:56-58`:

```tsx
if (!sessionRestored || !fontsLoaded) {
  return null;
}
```

expo-router explicitly warns against this: *"Ensure the Root Layout component is rendering a Slot, or other navigator on the first render"* (`routing.js:62-66`).

`linkTo()` queues without asserting, but `routingQueue.run()` calls `getNavigateAction()` → `assertIsReady()`, which **throws and abandons the rest of the already-drained batch** (`routing.js:89-103`). Any navigation issued in that window is silently lost. This makes launch ordering fragile and is a plausible amplifier, **though not by itself a loop**.

---

### F8 — `useRootNavigationState()` is not the readiness guard it appears to be — **PROVEN**

`build/hooks.js:78-87`:

```js
function useRootNavigationState() {
    const parent = useNavigation().getParent(INTERNAL_SLOT_NAME);
    if (!parent) throw new Error(...);
    return parent.getState();
}
```

It returns the *internal slot* navigator's state — the one holding only `__root`. Its `key` is assigned once and never changes, and the hook does not subscribe to state changes.

So `if (!navState?.key) return;` (`AuthGuard.tsx:38`) is effectively never taken once `AuthGuard` renders, and `navState?.key` in the dependency array is a constant. **The effect's real dependencies are `[authed, pathname]`.** This matters because the guard reads as if it waits for the root `<Stack>` to mount. It does not.

---

## 8. Suspected Render / State Update Loop

Steps 1–5 below are **PROVEN**. Step 6 (the session teardown) is the **one link still to be confirmed from a runtime log**.

```
COLD LAUNCH  (Expo Go, QR, no session in SecureStore)
  │
  ├─ RootLayout renders null            // _layout.tsx:56 — no navigator yet (F7)
  ├─ restoreSavedAccounts → restoreSession() → false → clearSession()
  ├─ setSessionRestored(true) → <Stack> mounts
  │
  ├─ root stack = [splash(A), index(I1)]  // anchor prepended (F5)
  │     splash(A).effect → markSplashPlayed(); timer(1500); NOT focused
  │     I1 renders → hasPlayedSplash()===false → <Redirect href="/splash">
  │     Redirect effect → replace("/splash")   // F2
  │
  ├─ root stack = [splash(A), splash(B)]  // splash mounted TWICE
  │     splash(A) timer fires while unfocused → returns, handedOffRef stays false (F6)
  │     splash(B) timer fires focused → replace("/")
  │
  ├─ root stack = [splash(A), index(I2)]  // login screen at index 1
  │     I2: authedAtMount = isAuthenticated() = false  → login form renders
  │
  ├─ USER SIGNS IN
  │     login() → setSession() → notify() → authed = true
  │     restoreTimeframeSelection() → emit()
  │     LoginForm → replace("/home")
  │
  ├─ root stack = [splash(A), (tabs)]     // pathname "/home", canDismiss() === TRUE (F5)
  │
  ├─ SESSION IS TORN DOWN   // 401 → handleUnauthorized() → clearSession() → notify()
  │                         // ← the one link still to be confirmed from the log
  │
  └─ LOOP ────────────────────────────────────────────────────────────┐
       AuthGuard effect  [authed=false, path="/home"]                  │
         redirectedRef = true                                          │
         canDismiss() → true → dismissAll()   // POP_TO_TOP, cold only │
         replace("/")           // routingQueue.add → nested update (F1)│
         ↓                                                             │
       pathname = "/"  →  index mounts / re-renders                    │
         isPublicRoute("/") → AuthGuard resets redirectedRef = false(F3)│
         ↓                                                             │
       index renders with authedAtMount === true (F4)                  │
         <Redirect href="/home"> fires on every render (F2)            │
         ↓                                                             │
       pathname = "/home"  →  protected, still unauthed  ──────────────┘
                     50 iterations → Maximum update depth exceeded
```

**The shape to internalise:** the latch and the snapshot defeat each other. `redirectedRef` is reset by the very route the redirect targets, and `authedAtMount` keeps the counter-redirect armed after the session it recorded is gone. Neither guard is wrong on its own; together they form a closed cycle.

### `AuthGuard` effect-by-effect analysis

`AuthGuard` renders `null`, holds no state, and has one ref and three effects. It subscribes to two reactive sources: `useAuthStatus()` (session store) and `usePathname()` (router-store `routeInfo` subscribers).

| Effect | Deps | Triggered by | Reads | Modifies | Can it re-trigger itself? |
|---|---|---|---|---|---|
| **Redirect** `:32-55` | `[authed, pathname, navState?.key, router]` — effectively `[authed, pathname]` (F8) | Session `notify()`; any pathname change | `authed`, `pathname`, `redirectedRef` | `redirectedRef`; **navigation state** via `dismissAll()` + `replace("/")` | **YES** — `replace("/")` changes `pathname`, which is a dep. The ref stops an immediate repeat but is re-armed by the public destination (F3). |
| **Touch** `:57-60` | `[authed, pathname]` | Same as above | `authed` | In-memory `expiresAt`; throttled SecureStore write | **NO** — `touchSession()` deliberately never calls `notify()`. |
| **Inactivity** `:65-85` | `[authed]` | Auth transitions only | `AppState`, `isSessionExpired()` | Can call `expireSession()` → `clearSession()` → `notify()` | **NO (today)** — TTL is 30 days, so `isSessionExpired()` is always false. Would be a real driver at the original 1 h TTL. |

**Specific questions answered:**

- **Are `router.*` calls inside effects?** Yes — `router.dismissAll()` and `router.replace("/")`, both at `AuthGuard.tsx:48-53`, inside the redirect effect. Under **F1** that is the crash mechanism.
- **Can it call `replace("/")` while already on `/`?** No — the `isPublic` branch returns first. But that same branch is what re-arms the latch (**F3**), which is worse: it makes the guard willing to fire again the instant the path leaves `/`.
- **Can it repeat the same navigation with no meaningful state change?** **Yes.** Every `public → protected → public` round trip re-arms the ref and produces another identical `replace("/")`, with `authed` unchanged at `false` throughout.
- **Is `router` in the dep array a hazard?** No — `useRouter()` returns the module-level `router` singleton (`build/imperative-api.js:10`), a stable reference.
- **Does the `navState?.key` guard work?** No — **F8**.

### Every auth-related navigation in the project

"Risk" = risk of participating in a redirect cycle.

| File | Navigation | Trigger | Auth condition | Risk |
|---|---|---|---|---|
| `components/AuthGuard.tsx:48-53` | `dismissAll()` + `replace("/")` | `useEffect` on `[authed, pathname]` | `!authed && !isPublicRoute(pathname)` | **HIGH** — re-armable latch (F3), navigates from an effect (F1) |
| `app/index.tsx:126` | `<Redirect href="/home" />` | **Every render while focused** (F2) | `authedAtMount && !entry.addAccount` — a *mount snapshot* | **HIGH** — suspected counterparty in the cycle (F4) |
| `app/index.tsx:120` | `<Redirect href="/splash" />` | Every render while focused (F2) | `!hasPlayedSplash()` — module flag, cold start only | **MEDIUM** — causes the double splash mount (F5) |
| `app/splash.tsx:57` | `replace("/")` | `setTimeout(1500)` → animation callback | none | **MEDIUM** — one-shot per instance, but the guard leaks (F6) |
| `components/auth/LoginForm.tsx:104` | `replace("/home")` | Submit handler, after `setSession` | Implicitly authed | LOW — user-initiated, ordering is correct |
| `app/(tabs)/profile.tsx:380` | `replace("/")` | `finally` of `handleLogout` | Runs even if `signOut()` throws | **MEDIUM** — duplicates `AuthGuard`'s redirect; can fire with the session still live if `signOut()` rejects |
| `app/switch-account.tsx:102 / :104` | `replace("/home")` or `replace("/")` | `useEffect`, ref-guarded, after a dwell | `committed \|\| isAuthenticated()` | LOW — one-shot per mount; route is public so `AuthGuard` stands down |
| `components/auth/SavedAccountsStrip.tsx:43` | `replace("/switch-account")` | Row press | Stored token validated first | LOW — user-initiated |
| `app/index.tsx:113-117` | `dismissAll()` + `replace("/switch-account")` | `onSuccess` in add-account mode | New session already set | LOW — user-initiated |
| `app/index.tsx:102` | `replace("/home")` | `handleBack` fallback | Assumes a live session | LOW — unreachable in the failing flow |
| `components/PushNotificationRouter.tsx:104` | `router.navigate(route)` | `useEffect` on `[authed, ready, pathname, tapCount]` | `authed && !isPublicRoute(pathname)` | LOW — capped at 3 attempts; inert on Android Expo Go |
| `app/profile/saved-accounts.tsx:45` | `push({ pathname: "/", params })` | Row press | Session stays live (add-account) | **MEDIUM** — **pushes `index` while authed**, so that instance captures `authedAtMount = true` (F4). Safe only because `addAccount=1` suppresses the redirect. |

**Conclusion: yes, multiple components compete to redirect the user.** Two of them (`AuthGuard` and `index.tsx`) own opposite directions of the same boundary and can fire from effects on every render.

---

## 9. Root Cause Assessment

> ### Verdict: **Root cause not yet fully confirmed.**
>
> The **error mechanism is PROVEN** (F1). **Eight structural defects are PROVEN** from the code (F1–F8). What is **not** proven from static reading alone is which of two counterparties closes the cycle in this specific run — and the logging needed to distinguish them is **already present in the code**.

### Strongly suspected root cause

**A two-authority redirect cycle across the auth boundary**, amplified into a crash by the fact that `expo-router@55` treats every `router.*` call as a React update on the app root (**F1**):

1. `AuthGuard` pushes an unauthed user from a protected route to `/` (**F1** — from an effect).
2. `/` is public, so `AuthGuard` immediately re-arms `redirectedRef` (**F3**).
3. `index.tsx` still holds `authedAtMount === true` from a mount that happened while the session was alive (**F4**).
4. Its `<Redirect href="/home" />` fires again on the very next render (**F2**), returning the app to a protected route.
5. Repeat until React's nested-update counter hits 50.

Cold start makes this materially worse because the extra `splash` anchor route (**F5**) means `canDismiss()` is true, so each `AuthGuard` redirect emits **two** queued navigation actions instead of one — double the nested-update pressure per cycle.

### The unconfirmed link

The chain requires the session to become invalid **after** a successful login (a 401 teardown via `handleUnauthorized()`), or for `index` to have been mounted while authed. Neither can be confirmed from source alone. **Section 14 lists exactly what to read in the log to settle it.**

---

## 10. Alternative Causes Considered

### RULED OUT

| # | Candidate | Evidence for elimination |
|---|---|---|
| **R1** | Inactivity / session expiry | `src/lib/session.ts:16-17` already carries `// TEMP: 30-day session while debugging the login nav bug; was 60 * 60 * 1000 (1h)`. The bug survives a 30-day TTL, so `expireSession()` and the 60-second sweep in `AuthGuard`'s third effect cannot be firing. **That experiment is already conclusive — do not repeat it.** |
| **R2** | Unstable `useSyncExternalStore` snapshots (the classic cause of this error) | All four app stores checked. `session.getAuthSnapshot` returns a string; `activeLocationStore`, `timeframeStore` and `savedAccountsStore` all return stable module-level references and guard against no-op writes. None returns a fresh object per call. |
| **R3** | Other globally mounted components | `PushNotificationRouter` is capped at `MAX_DELIVERY_ATTEMPTS = 3` (`pushNavigationQueue.ts:121-127`) and is fully inert on Android Expo Go (`loadNotifications()` returns `null`). `PushDeviceRegistrar`, `AppUpdateGate`, `useAppUpdateCheck` and `QuickNavFab` perform no navigation. `useTransientAlert`'s `show` is `useCallback`-stable, so `index.tsx`'s notice effect is not self-triggering. |

### POSSIBLE contributing factors (not demonstrated)

- **F7 — `RootLayout` returning `null` on first render.** Makes launch-time navigation order-dependent and can silently drop queued actions. Amplifier, not a loop.
- **F6 — the leaked `handedOffRef` on `splash(A)`.** Inert today; a hazard for any future refactor.
- **`signOut()` ordering.** `src/services/auth.ts:223-234` awaits `unregisterCurrentPushDevice` and `revokeToken` — up to 16 s of network — **before** `clearSession()` deletes the SecureStore keys. Force-closing the app during that window leaves a **server-side-revoked token still on disk**. The next launch then restores a session, `index` mounts with `authedAtMount === true`, and the first authenticated request 401s — arriving directly at the **F4** state. Also, `profile.tsx`'s `finally` navigates to `/` even if `signOut()` *rejects*, so the UI can claim the user signed out while the session is fully intact.
- **`profile.tsx`'s duplicate `replace("/")`.** Today harmless (same public destination), but it is a third writer to the same boundary.

---

## 11. Recommended Fix

**Not implemented.** Governing principle for all options: **one authority owns the auth boundary, and it does not navigate from a passive effect.**

### Option 1 — RECOMMENDED: move the boundary to `Stack.Protected`

Wrap the screen groups in `<Stack.Protected guard={…}>` in `_layout.tsx`, and delete `AuthGuard`'s redirect effect together with both `<Redirect>`s in `index.tsx`.

**Why this resolves the loop:** React Navigation performs the redirect as part of *state reconciliation* rather than by scheduling an update from a passive effect. That removes **F1, F2, F3 and F4 at once** — there is no longer a second authority, and no `router.*` call inside an effect at all.

- `Stack.Protected` is **available in the installed version** — verified at `build/views/Protected.js` and `build/layouts/StackClient.js:467`. No upgrade needed.
- Keep `AuthGuard` for what only it does: `touchSession` and the inactivity sweep.
- `splash` stays the anchor, which is exactly where `Protected` falls back to.
- Delete `authedAtMount` — the guard makes it unnecessary.

This is also the pattern Expo currently documents; the redirect-based approach this app uses is now filed separately as *Authentication (redirects)* for SDK 52 and earlier.

### Option 2 — ALTERNATIVE: keep the imperative guard, but make it the only authority

Lower-risk if `Stack.Protected` disturbs too much of the existing stack choreography.

- Delete `index.tsx:125-127` (`<Redirect href="/home" />`) and `authedAtMount`. Give `AuthGuard` **both** directions: `!authed && !isPublic → "/"` and `authed && isPublic → "/home"`.
- Replace `redirectedRef` (a boolean that re-arms) with a ref holding **the last destination requested for the current `(authed, pathname)` pair**, so a re-arm can never produce a second identical hop.
- Replace `index.tsx:119-121`'s splash redirect with a plain conditional render, or move the splash decision out of the route tree entirely, so `splash` can never mount twice (**F5**, **F6**).
- Have `profile.tsx`'s logout stop navigating; let the single authority react to the `notify()`.

**Why it should work:** it removes the counterparty (**F4**) and makes the latch destination-aware (**F3**), so the cycle has no second leg. It leaves **F1** in place, so the app stays vulnerable to any future second authority.

### Option 3 — AVOID: patches that hide the cycle

- **Adding `setTimeout` / `InteractionManager` before the redirect** — turns a deterministic crash into a timing-dependent one and re-introduces the flash of the wrong screen.
- **Removing `pathname` from the dependency array** — the guard would then miss navigations into protected routes, silently leaving unauthed users on authed screens.
- **Adding another boolean on top of `redirectedRef`** — the existing ref already failed for a structural reason (**F3**); a second one fails the same way.
- **Swapping `replace` for `navigate`** — still routes through `routingQueue.add`, so **F1** is unchanged, and it breaks the stack reset that logout depends on.
- **Reverting the 30-day TTL as part of the fix** — unrelated (**R1**), but *do* restore the intended 1 h sliding window **after** the fix lands and re-test, since `AuthGuard`'s third effect becomes live again.

---

## 12. Potential Side Effects

- **Removing `redirectedRef` without removing the second authority** → an immediate, harder loop. The ref is currently the only thing damping it. **Never remove it first.**
- **Making `authedAtMount` live (reactive) instead of deleting it** → reintroduces the exact bug its own comment describes: the login screen would re-render into a redirect while `LoginForm` is navigating imperatively, and the two would compete. It must be removed **together with** handing the redirect to a single owner.
- **Adopting `Stack.Protected`** changes back-stack semantics. Three things depend on the current shape: `AuthGuard`'s `dismissAll()`, `index.tsx`'s `handleAccountAdded`, and the `/switch-account` bridge whose entire purpose is to unmount `(tabs)` by replacing the stack root. **Re-test account switching specifically.**
- **Changing or removing `initialRouteName: "splash"`** → changes the anchor that `Protected` redirects to, and changes which screens get the `AUTH_SCREEN_OPTIONS` cross-fade rather than the default `ios_from_right` slide. Expect visual regressions at the auth boundary.
- **Touching `isPublicRoute`** → it is shared with `AppUpdateGate` (`AppUpdateGate.tsx:51,57`). Widening it would let the optional-update dialog land on the login form; narrowing it would let `AuthGuard` redirect off `/switch-account` mid-swap, killing account switching.
- **Making `RootLayout` render a navigator on first render (fixing F7)** → screens would mount before `restoreSession()` resolves, so every consumer of `getCurrentUser()` at mount would see `null`. This needs the guard in place first, or it trades a crash for a flash of the login screen on every authenticated launch.
- **Fixing `signOut()`'s ordering** (clearing local state before the two network calls) is low-risk and independently valuable — but it changes the order in which `markAccountSignInRequired` and `clearSession` observe the token, so check that the saved-account row still lands in `signin_required` and not `linked`.

---

## 13. Regression Test Scenarios

Run every case on a **physical device via Expo Go** (the reported environment) and again on a dev build, with `__DEV__` logging on.

**Pass criteria for all rows:** no `Maximum update depth exceeded`; `[AuthGuard] router.replace("/")` appears **at most once** per auth transition; `[render] AuthGuard` paths never alternate.

| # | Case | Setup | Expected | Watch for |
|---|---|---|---|---|
| T1 | First login, ever | Fresh install, no saved accounts | Splash → login → dashboard | Splash renders once; `[render] AuthGuard` count in single digits |
| T2 | Logout → login, app never closed | Signed in, sign out from Profile | Login screen, then dashboard | **The known-good baseline — must not regress** |
| T3 | **Logout → force-close → reopen → login** | Scenario B | Splash → login → dashboard | **The reported crash. Primary acceptance test** |
| T4 | Force-close *during* the logout spinner | Kill the app while `signOut()` is on the network | Next launch shows the login screen, not the dashboard | Stale token surviving in SecureStore (Section 10) |
| T5 | Restart while authenticated | Signed in, force-close, reopen | Splash → dashboard, no login flash | `authedAtMount` path; splash must not mount twice |
| T6 | Restart while authenticated, offline | Airplane mode, reopen | Session kept (`validateStoredSession` swallows the timeout) → dashboard | Must not bounce to login on a network failure |
| T7 | Expired session | Restore the 1 h TTL, idle in foreground past the deadline | Auto sign-out to login with the "session expired" notice | `AuthGuard`'s third effect goes live again — **highest-risk regression** |
| T8 | Invalid / revoked token | Revoke server-side, then cold launch | `validateStoredSession` 401s → login, no dashboard flash | The 401 → teardown → redirect path in isolation |
| T9 | Mid-session 401 | Revoke while sitting on a module screen | One redirect to login, stack fully reset | Exactly one `[AuthGuard] router.replace("/")`; Back must not re-enter |
| T10 | Unauthenticated cold start | Fresh install, open and idle 60 s on login | Stays on login | No redirects while idle on a public route |
| T11 | Deep navigation, then logout | Push 3–4 module screens, then sign out | Stack reset to login; Back exits | `dismissAll()` behaviour under both stack shapes (F5) |
| T12 | Add account while signed in | Profile → Saved Accounts → add | Login form with the back button; current session stays live | `addAccount=1` must still suppress the `/home` redirect |
| T13 | Switch accounts | Two saved accounts, switch via the strip | Switch bridge → new account's dashboard with its own role/tabs | The bridge still unmounts `(tabs)`; role-specific tabs update |
| T14 | Cold start from a notification tap | Dev build (not Android Expo Go), tap a push while closed | Splash → login → after sign-in, the notification's destination | Park→claim→settle still settles; capped at 3 attempts |
| T15 | Background → foreground, authed | Home button, wait, return | Same screen, session extended | `registerAppResume` must not notify or navigate |
| T16 | Forced app update on cold start | Backend reports `force_update` | Dialog over everything except splash | Dialog and auth redirect must not fight for the viewport |

**Run T3, T5 and T9 both cold and warm** — they are the three that exercise the differing stack shape. **T2 vs T3 is the regression pair that defines this bug.**

---

## 14. Device Verification Checklist

These items **cannot be settled from source** and require one reproduction of Scenario B on a real device. The instrumentation is **already in the code** — no changes needed for items 1–4.

- [ ] **1. Count the occurrences of `[AuthGuard] router.replace("/")` in the full log.**
  - More than once → confirms the ping-pong (**F3** + **F4**), and the root cause is confirmed.
  - Exactly once → `AuthGuard` is a passenger and the chain is driven elsewhere; re-open the investigation with that log.
- [ ] **2. Read the `path=` values in consecutive `[render] AuthGuard (authed=… path=… navKey=…)` lines** (`AuthGuard.tsx:22-26`).
  **An alternating `/ → /home → / → /home` is the smoking gun.**
- [ ] **3. Check whether `[SESSION] notify() -> N listeners; authed=false` appears *after* `[LoginForm] router.replace("/home")`.**
  If so, a 401 tore the session down post-login — look for an adjacent `[api] … failed` warning to identify the offending request.
- [ ] **4. Check the `[render] RootLayout` count.** Anything above 2–3 means the whole shell is re-rendering inside the cascade.
- [ ] **5. Confirm the platform** (Android vs iOS Expo Go). On Android Expo Go, `loadNotifications()` returns `null`, so `PushNotificationRouter` is inert — this changes which components can be involved.
- [ ] **6. Confirm the login method used in step 4 of Scenario B** — typed credentials via `LoginForm`, or a tap on the `SavedAccountsStrip` row (which routes through `/switch-account`). They are different code paths.
- [ ] **7. Confirm whether a session survives the logout.** On the launch of a *supposedly logged-out* app, check for `[SESSION] notify()` with `authed=true` — that would indicate `clearSession()` never ran (the `signOut()` ordering issue in Section 10).
- [ ] **8. OPTIONAL, one line, no behaviour change:** log `authedAtMount` and `isAuthenticated()` together in `index.tsx`'s render. **If they ever disagree, F4 is confirmed as the counterparty** and the root cause moves from *leading candidate* to *confirmed*.
- [ ] **9. Verify the stack shape claim (F5) empirically** — log `router.canDismiss()` inside `AuthGuard`'s redirect effect and confirm it is `true` on cold start and `false` on warm.

---

## 15. Current Conclusion

- **The error mechanism is PROVEN.** In `expo-router@55`, `router.replace()` from inside a `useEffect` is a React state update on the app's root fiber scheduled during the commit phase. Roughly 50 chained ones throw `Maximum update depth exceeded`. **A strictly infinite loop is not required.**
- **Eight structural defects are PROVEN** (F1–F8), the most significant being: `<Redirect>` re-fires every render (**F2**); `redirectedRef` is a re-armable latch, not a one-shot (**F3**); `authedAtMount` is a mount snapshot that can contradict live auth state (**F4**); and cold/warm launches produce genuinely different root-stack shapes (**F5**).
- **The cold/warm divergence is understood and is about navigation state, not auth state.** The `splash` anchor exists only in the launch state, so `router.canDismiss()` is `true` cold and `false` warm — meaning `AuthGuard`'s `dismissAll()` branch runs only on cold start, emitting two queued actions per redirect instead of one.
- **Three candidate causes are RULED OUT with evidence** (R1 expiry, R2 unstable store snapshots, R3 other global components) — these should not be re-investigated.
- **The root cause is NOT yet fully confirmed.** The strongly suspected cause is a two-authority redirect cycle between `AuthGuard` and `index.tsx`'s `<Redirect href="/home" />`, but the link that starts it (a session teardown after login, or an `index` instance mounted while authed) has not been observed in a log.
- **The original hypothesis about `AuthGuard` is half right:** `AuthGuard` is genuinely involved, but it cannot loop by itself, and the stack trace alone does not prove it drives the chain.

---

## 16. Next Steps

1. **Do not change application code yet.** Reproduce Scenario B once on a device and collect the **full** `__DEV__` log.
2. Work through **Section 14, items 1–4**, using the logging already present. This is expected to confirm or eliminate **F4** as the counterparty and move the root cause to *confirmed*.
3. If items 1–4 are ambiguous, add **only** the single optional log line in Section 14 item 8 (`authedAtMount` vs `isAuthenticated()` in `index.tsx`) — no behaviour change — and reproduce again.
4. Once confirmed, implement **Option 1** (`Stack.Protected`) from Section 11, or **Option 2** if the stack choreography around `/switch-account` proves too fragile to disturb.
5. Run the full test matrix in Section 13, giving particular attention to **T2 vs T3** (the defining regression pair) and **T13** (account switching, the most fragile dependency on the current stack shape).
6. **After the fix lands and passes**, restore the intended 1 h sliding session TTL in `src/lib/session.ts:16-17` (currently a documented 30-day TEMP value) and re-run **T7** — `AuthGuard`'s inactivity effect becomes live again and is the highest-risk regression.
7. Separately and independently of the loop fix, consider reordering `signOut()` in `src/services/auth.ts` so local state is cleared before the two network calls, and consider whether `profile.tsx`'s `finally { router.replace("/") }` should still navigate when `signOut()` rejects.

---

## Appendix A — Temporary Runtime Instrumentation (added after the first pass)

**Status: TEMPORARY. Delete all of this once the trigger chain is confirmed.**

Logging only — no behaviour was changed. `tsc --noEmit` and `eslint` both pass.

### The logger

`src/lib/debug/authDebug.ts` **(new file — delete it to remove the instrumentation)**

```text
[AUTH-DEBUG #017] +2841ms AuthGuard → REDIRECT to / | authed=false token=false user=null (was authed=true user=7) | from=/home canDismiss=true
└── sequence ──┘ └ since ┘ └──── event ───────────┘   └────────── auth snapshot ──────────┘   └──── detail ────┘
                  JS start
```

- **Sequence number** — monotonic, so the trace can be reconstructed chronologically even when lines interleave.
- **`+Nms`** — measured from JS-runtime start. **A cold reopen through Expo Go restarts the runtime, so both the counter and the timer reset to zero. That is how a cold launch is distinguished from a warm one.**
- **Auth snapshot** — attached automatically to every line. `lib/session.ts` registers a reader via `registerAuthDebugSource()`, so `authDebug.ts` never imports session (no cycle). A `(was …)` suffix appears only on the line where auth state actually transitioned — this is the "previous auth state" record.
- Self-guards on `__DEV__`, so call sites stay one line.

### Instrumentation points

| File | Events logged | What it distinguishes |
|---|---|---|
| `src/lib/session.ts` | `setSession begin`, `restoreSession read` (found token/user), `clearSession begin`, **`invalidateSession`** (reason + `alreadyLatched`), `notify` (listener count) | Whether a teardown happens **after** login — **the report's one unconfirmed link**. Replaces the old `[SESSION]` logs. |
| `src/lib/api.ts` | `api.401 → handleUnauthorized` with method + path | **Names the exact request** that tears the session down, if one does. |
| `src/services/auth.ts` | `validateStoredSession` status / network-error / skipped | Whether the launch token check 401s, or keeps the session offline. |
| `src/app/_layout.tsx` | `RootLayout render` (+`sessionRestored`, `fontsLoaded`), `hydration START`, **`hydration COMPLETE → mounting <Stack>`** | Hydration timing vs. everything else; RootLayout render count (checklist item 4). |
| `src/components/AuthGuard.tsx` | `render`, `redirect-effect` (+**`trigger`** = which dep changed, `isPublic`, `refArmed`), `skip: navigator not mounted`, **`RE-ARM redirectedRef`**, `REDIRECT to /` (+**`canDismiss`**), `dismissAll()`, `replace("/")`, `suppressed by redirectedRef` | Whether the effect ran from a dep change or an identity-only re-render; whether **F3** (re-arming) actually happens; **verifies F5** via `canDismiss` (checklist item 9). |
| `src/app/index.tsx` | `render` with **`authedAtMount` vs `liveAuthed`**, `splashPlayed`, `addAccount`; plus which branch it returns (`<Redirect href=/splash>` / `<Redirect href=/home>` / login form) | **The F4 test (checklist item 8).** If `authedAtMount=true liveAuthed=false` ever prints, F4 is confirmed as the loop counterparty. Render count = `<Redirect>` fire count, per **F2**. |
| `src/app/splash.tsx` | `MOUNT` / `FOCUS` / `BLUR` / `replace("/")` / `hand-off SKIPPED`, each tagged with an **instance number** | **Verifies the F5 double-mount claim** and the **F6** `handedOffRef` leak, directly. |
| `src/components/auth/LoginForm.tsx` | `submit`, `POST /api/login OK`, `replace("/home")`, `replace returned` | Anchors the login moment in the trace. Replaces the old `[LoginForm]` logs. |
| `src/app/(tabs)/profile.tsx` | `logout START`, `signOut() resolved`, **`signOut() REJECTED — session may still be live`**, `replace("/")` | Tests the `signOut()`-ordering possibility in Section 10 (checklist item 7). |
| `src/app/switch-account.tsx` | `replace("/home")` / `replace("/")` with `committed` | Identifies which login path was used (checklist item 6). |

### Behaviour-preservation notes

Three edits touched control flow shape without changing semantics — verify these are reverted cleanly:

1. **`AuthGuard`** — `router.canDismiss()` was hoisted into a `const` purely so the value could be logged. It was already evaluated exactly once at that point. An `else` branch was added that **only** logs.
2. **`profile.tsx`** — a `catch` was added around `await signOut()` that logs and **rethrows**. Rejection propagation and the `finally` are unchanged.
3. **`splash.tsx`** — `instance` was added to the `useFocusEffect` callback's dependency array. It is assigned once per component instance, so callback identity is still stable across renders.

### How to remove

```
git checkout -- src/lib/session.ts src/lib/api.ts src/services/auth.ts \
  src/app/_layout.tsx src/app/index.tsx src/app/splash.tsx src/app/switch-account.tsx \
  src/components/AuthGuard.tsx src/components/auth/LoginForm.tsx "src/app/(tabs)/profile.tsx"
rm -r src/lib/debug
```

(Only valid while these files have no other uncommitted work.)

### How to capture

1. `npx expo start -c`, open through the QR code.
2. Reproduce **Scenario A** (warm) first — it is the control. Save the console output.
3. Reproduce **Scenario B** (cold). Save the output plus the full stack trace if the crash fires.
4. Filter with `AUTH-DEBUG` and keep the lines **in sequence-number order**.

### Reading the result — decision table

| Observation in the Scenario B log | Conclusion |
|---|---|
| `index(login) render` shows `authedAtMount=true liveAuthed=false` | **F4 CONFIRMED.** The two-authority cycle is the root cause; fix `index.tsx` + `AuthGuard` together. |
| `AuthGuard → RE-ARM redirectedRef` alternating with `AuthGuard → REDIRECT to /` | **F3 CONFIRMED** as the mechanism that lets the guard fire repeatedly. |
| `index → returns <Redirect href=/home>` repeats many times | **F2 CONFIRMED** at runtime; the login route is the counter-authority. |
| `api.401 → handleUnauthorized` or `session.invalidateSession` appears **after** `LoginForm POST /api/login OK` | The unconfirmed link is closed: a post-login teardown starts the cycle. The named path/method identifies the culprit request. |
| No teardown line at all, yet `AuthGuard → REDIRECT` fires | The loop is **not** driven by a 401. Re-open the investigation — the auth snapshot on each line will show what `authed` actually was. |
| `AuthGuard redirect-effect` with `trigger=none(identity-only)` | A dependency is changing identity per render — would contradict **F8** and **R2**; investigate that dep. |
| `splash MOUNT instance=1` and `instance=2` in one cold launch | **F5 double-mount CONFIRMED.** |
| `AuthGuard → REDIRECT … canDismiss=true` cold and `canDismiss=false` warm | **F5 stack-shape divergence CONFIRMED** — the cold/warm difference is proven at runtime. |
| `logout signOut() REJECTED` in the Scenario B logout step | The Section 10 `signOut()`-ordering path is real; the session survived the logout. |

---

## Appendix B — Runtime Evidence, and the Stale-Closure Finding

Runtime traces for both scenarios were captured. This appendix records what they proved, what they **disproved**, and what remains open. **Confidence labels from Sections 1–16 still apply; two are changed here and both changes are noted explicitly.**

### B.1 The Scenario B evidence

```text
#031 AuthGuard render          | authed=true | path=/home
#032 AuthGuard redirect-effect | authed=true | path=/home
#033 AuthGuard → REDIRECT to / | authed=true | from=/home canDismiss=false
```

Plus, confirmed on the `/` leg:

```text
AuthGuard → RE-ARM redirectedRef | because=publicRoute path=/
```

The sustained cycle `/home → AuthGuard replace("/") → / → index <Redirect href="/home"> → /home` is confirmed by the trace.

### B.2 The contradiction — and its resolution

`AuthGuard.tsx` can only reach the redirect branch when `!authed && !isPublicRoute(pathname)`. Yet all three lines print `authed=true`.

**Resolved: the logger never printed the closure value. — PROVEN**

`authDebug` builds its auth segment from the registered source (`authDebug.ts:66-78`), which is `session.ts:40-47`:

```ts
registerAuthDebugSource(() => ({
  authed: isAuthenticated(),   // ← LIVE module read, evaluated AT LOG TIME
  ...
}));
```

None of the three AuthGuard call sites passed `authed` in their `detail` object. **So `authed=` on every line is `isAuthenticated()` sampled when the line was printed — never the value the branch tested.** This was a gap in the Appendix A instrumentation, now closed (see B.6).

### B.3 F9 — The redirect effect can branch on a session state that has already moved on — **PROVEN**

Three source facts, in order:

1. **`useAuthStatus()` returns live state at render time**, not a store snapshot:
   ```ts
   export function useAuthStatus(): boolean {
     useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
     return isAuthenticated();          // ← evaluated during render
   }
   ```
   So `closureAuthed` always equals `isAuthenticated()` **as of that render**.

2. **Render #031's closure was therefore `authed === true`.** `const authed = useAuthStatus()` and the `authDebug("AuthGuard render")` call sit in the same synchronous render pass with no `await` between them, so they cannot disagree. #031 printing `authed=true` proves that render captured `true`.

3. **An effect whose closure holds `authed === true` returns at the `if (authed || isPublic)` branch and can never reach the redirect.** Since #032/#033 *did* reach it, **the effect that ran at #032 did not come from render #031.** It came from an earlier committed render whose closure held `authed === false`, and it executed after the session had already become authenticated.

**This is a stale effect closure, proven from source rather than inferred from the stack trace.**

**Why the dependency array does not prevent it:** `authed` **is** in the deps (`AuthGuard.tsx`, redirect effect). Dependencies guarantee that a *later* re-run will observe the new value — they do **not** cancel the effect of an already-committed render. React runs the passive effects of every committed render. And `router.replace()` is **irreversible**: an effect cleanup cannot un-dispatch a navigation. **An irreversible side effect keyed to a captured value is unsound whenever that value can change between commit and effect flush.**

**F9b — the window is structurally widened by the session store. — PROVEN**
Both `setSession` and `clearSession` mutate module state **synchronously** but call `notify()` only **after awaiting three SecureStore operations**:

```ts
authToken = token;                              // live auth flips here
...
await Promise.all([ /* 3 × SecureStore */ ]);   // ← keychain round-trips
notify();                                        // React only learns here
```

So live auth and React's rendered auth are *guaranteed* to disagree for the duration of three keychain writes/deletes. Any AuthGuard render committed inside that window carries a closure that is already wrong.

### B.4 F5 is corrected — **downgraded from PROVEN to DISPROVEN (direction)**

Section 7's F5 predicted cold → `[splash, (tabs)]` (`canDismiss=true`) and warm → `[(tabs)]` (`canDismiss=false`). **The runtime shows the opposite** (`canDismiss=false` cold at `/home`). The `initialRouteName` → anchor plumbing is real (`getRoutesCore.js:626-630`), but the derivation of *when the anchor is materialised* was wrong.

`canDismiss()` and `pathname` are read from the same snapshot (`store.onStateChange` assigns `state` and `routeInfo` together), so the reading is coherent: **at `/home` in Scenario B the root stack was exactly `[(tabs)]`, with no `splash` beneath it.** The remaining F5 sub-claims (double splash mount) are **NEEDS VERIFICATION** — the `splash MOUNT instance=` lines settle them.

### B.5 `canDismiss` is not the trigger — **PROVEN**

In `AuthGuard.tsx` the redirect branch is entered at `if (authed || isPublic)`, `redirectedRef.current = true` is set next, and only *then* is `router.canDismiss()` read. Its sole consumer is the `if (canDismiss) router.dismissAll()` line. **Removing it entirely would not stop the redirect.** The cold/warm `canDismiss` difference is a readout of stack depth, not a cause. (Note also that `canDismiss` is only emitted *inside* the redirect branch, so a Scenario A line showing `canDismiss=true` cannot have come from a `/home` render where no redirect occurred — most likely it is the logout redirect.)

### B.6 Instrumentation added this round

`src/components/AuthGuard.tsx` only — still logging-only, `tsc --noEmit` and `eslint` clean:

- A module-level `renderId`, logged on every render and **captured by the effect closure**, so each effect run names the render it belongs to (`fromRenderId=`).
- `closureAuthed`, `closurePathname`, `closureIsPublic` — the values the branch actually tests.
- `liveAuthed` — `isAuthenticated()` at log time, alongside them.

> **`renderId` is deliberately NOT in the dependency array.** It changes every render; including it would make the effect run on every render and change the behaviour under investigation. An `eslint-disable-next-line react-hooks/exhaustive-deps` documents this. The dependency array is byte-identical to the original.

**Decisive line to look for:**
```text
AuthGuard → REDIRECT to / | fromRenderId=N closureAuthed=false liveAuthed=true …
```
`closureAuthed=false liveAuthed=true` confirms **F9**. `closureAuthed=true` would falsify the reading in B.3 and reopen the question.

### B.7 Still unresolved — **NEEDS VERIFICATION**

Because `useAuthStatus()` reads live state at render, the render that fired the redirect genuinely observed `isAuthenticated() === false`. **What made it false, and what made it true again by effect-flush time, is not yet established.** `sessionInvalidated` latches (`session.ts`), so a single 401 teardown cannot revive on its own — something must be re-establishing the session, or the teardown is happening repeatedly. The `session.setSession begin` / `session.invalidateSession` / `api.401 → handleUnauthorized` lines already being emitted will name it.

**Do not mark the root cause fully PROVEN until that is answered.** What *is* proven is the mechanism by which a redirect fires against a session that is already valid — and that mechanism is sufficient to justify the fix, because every candidate explanation is eliminated by the same change.

### B.8 Roles in the cycle — **PROVEN by the trace**

- **`AuthGuard` is the initiating half.** It makes the first move off `/home` (`#033`).
- **`index.tsx` is the sustaining half.** Its `<Redirect href="/home">` returns the app to the protected route, and because `/` is public, `AuthGuard`'s own destination re-arms `redirectedRef` (**F3**) so the guard is ready to fire again.
- Neither half is individually wrong; **the cycle is a property of there being two of them.**

---

## Appendix C — Session-Mutation Timing and React Effect Ordering

This round completed the two experiments that are answerable from source alone. **The render/effect correlation experiments (renderId chronology) require a fresh device run and have NOT been performed** — no trace with `renderId` / `closureAuthed` has been captured yet. Nothing here is marked PROVEN on the strength of a run that did not happen.

### C.1 Experiment 6 — `setSession()` mutation timing — **PROVEN (source)**

Exact ordering in `src/lib/session.ts`:

| Step | Line | What happens |
|---|---|---|
| 1 | `:70` | `authDebug("session.setSession begin")` |
| 2 | **`:75-81`** | **`authToken`, `authUser`, `expiresAt` assigned, `sessionInvalidated = false`. `isAuthenticated()` becomes `true` HERE — synchronously.** |
| 3 | `:88-91` | `resetActiveLocation()` → synchronous `listeners.forEach(...)` on the active-location store → schedules React updates for `useActiveLocation()` consumers. `void metricsCacheService.clearAllCaches()` (not awaited). |
| 4 | `:94` | `void upsertSavedAccount(...)` — **not awaited**. Internally `commit()` → `emit()` → synchronous `listeners.forEach(...)` on the saved-accounts store → **schedules React updates for `useSavedAccounts()` consumers, which includes `src/app/index.tsx:40`.** |
| 5 | `:96-101` | `await Promise.all([3 × SecureStore.setItemAsync])` — **the async window.** |
| 6 | **`:108`** | **`notify()` — only NOW are `useAuthStatus()` subscribers scheduled.** |

**Between step 2 and step 6, live authentication is already `true` while `useAuthStatus` subscribers have not been told.** Two *other* stores emit inside that window (steps 3 and 4), so unrelated components can render during it.

**Runtime corroboration** — the Scenario B excerpt shows exactly this:

```text
session.setSession begin                       ← step 1
index render | authed=true token=true user=1   ← a render INSIDE the window (steps 3/4 emitted)
session.notify | authed=true token=true user=1 ← step 6
AuthGuard render | authed=true token=true user=1
```

The `index render` line falling *between* `setSession begin` and `session.notify` is direct evidence that React committed a render while live auth had already flipped but the auth store had not yet notified.

**`clearSession()` has the same shape** (`:209-226`): `authToken/authUser/expiresAt` are nulled synchronously, `resetActiveLocation()` emits synchronously, then three SecureStore **deletes** are awaited, and only then `notify()`. So the mirror window exists on teardown: **live auth `false`, React not yet told.** Because `useAuthStatus()` returns `isAuthenticated()` evaluated *at render time*, any AuthGuard render occurring inside that window — triggered by `usePathname()`, i.e. by any navigation — reads `authed === false` legitimately.

### C.2 Experiment 7 — React effect ordering — **PROVEN (semantics)**

- The redirect effect is created fresh by every committed render whose deps changed; its closure captures that render's `authed`, `pathname`, `navState?.key`, and (as instrumentation) `renderId`.
- **React never skips the passive effects of a committed render.** If render N commits, its passive effect runs, even when render N+1 is already queued.
- **A dependency array does not cancel an already-committed render's effect.** Deps only decide whether the *next* render re-runs the effect. The correct model is "**old effect still executes, then the new effect re-runs**" — not "the new deps supersede the old run."
- `router.replace()` is **irreversible**. An effect cleanup cannot un-dispatch a queued navigation (`routingQueue.add` has already fired — see F1).

**Consequence:** a committed render with `(authed=false, pathname="/home")` will fire `router.replace("/")` even if live auth became `true` microseconds later and even though `authed` is in the deps. The subsequent render with `authed=true` then re-arms the ref — after the navigation is already in flight.

### C.3 What the current Scenario A / Scenario B excerpts do and do not show

Both excerpts contain **identical logged fields** at the decisive point:

```text
Scenario A                                    Scenario B
AuthGuard render      | authed=true | /home   AuthGuard render      | authed=true | /home
AuthGuard redirect-effect | authed=true|/home AuthGuard redirect-effect | authed=true|/home
(stays)                                        AuthGuard → REDIRECT to / | from=/home
```

Since `authed=` is the **live** sample (B.2) and the branch tests the **closure**, the traces diverge only in a value that was never logged.

**Every reading consistent with both excerpts requires the same thing: a committed AuthGuard render with `closureAuthed === false` and `closurePathname === "/home"` in Scenario B.** That is true whether the redirect came from the effect shown or from a later one hidden by trimming. This narrows B.7 considerably, but it is **inference, not proof** — the excerpts are trimmed and carry no `renderId`.

### C.4 Status after this round

| Item | Status | Why |
|---|---|---|
| **F9** (effect branches on a session state that has moved on) | **NEEDS VERIFICATION** | Mechanism proven possible (C.1 + C.2). Not yet observed — requires a `closureAuthed=false liveAuthed=true` line with a correlated `fromRenderId`. |
| **F9b** (notify lags synchronous mutation) | **PROVEN** | C.1, source + the `index render` line inside the window. |
| **Effect-ordering semantics** | **PROVEN** | C.2. |
| **B.7** (what created the false `/home` render) | **NEEDS VERIFICATION** | Narrowed (C.3) but not identified. |
| **Scenario A never commits a false `/home` render** | **NEEDS VERIFICATION** | Its excerpt starts after login; absence in a trimmed trace proves nothing. |

### C.5 Instrumentation completed this round (`AuthGuard.tsx`, `api.ts`, `LoginForm.tsx`)

Logging only; `tsc --noEmit` and `eslint` clean; **dependency array byte-identical to the original** (verified by diff).

- `AuthGuard` render line now also carries `isPublic` and `refCurrent` (the ref as of that render).
- `refAtEntry` — the ref value as the effect *enters*, before any branch mutates it — on the effect, RE-ARM, and REDIRECT lines.
- `closureAuthed` / `liveAuthed` now on the RE-ARM line too, so the non-redirecting branch is equally diagnosable.
- `api.request` for **every authenticated request** (method + path) and `api.response NOT OK` for every non-2xx — so a teardown can be traced to the call that caused it, and a failure is never first seen as a teardown.
- `LoginForm submit FAILED` with status/message.

> **⚠️ Observer effect.** This is a timing-sensitive race and `console.log` is not free. Heavier logging can widen or narrow the window under investigation. If the loop stops reproducing with full instrumentation on, that is itself evidence about the window's size — record it rather than treating it as a fix.

---

## Appendix D — Fix Implemented

**This appendix is the first in this document to change application behaviour.** Appendices A–C remain accurate as written; nothing above is rewritten.

### D.1 Runtime reproduction — NOT PERFORMED

No device, emulator, or `adb` is available in this environment (`adb: command not found`, `emulator: command not found`). **Scenario A and Scenario B were not executed this round.** No runtime evidence beyond the previously supplied excerpts was collected, and no hypothesis is upgraded on the strength of a run that did not happen.

### D.2 Phase 5 — session-mutation call graph, verified against current source

| Path | Caller / condition | Reachable in Scenario B between login and `/home`? | Makes auth false? | Can it make auth true again? |
|---|---|---|---|---|
| `api.ts` 401 → `handleUnauthorized()` → `invalidateSession("unauthorized")` → `clearSession()` | any `apiRequest` carrying a token | **YES** — `/home` mounts and fires authenticated requests | Yes | **No** — `sessionInvalidated` latches; only `setSession` clears it |
| `services/auth.ts` `validateStoredSession()` 401 | launch only, and only when `restoreSession()` returned `true` | No — Scenario B has no stored session | Yes | No |
| `services/auth.ts` `signOut()` → `clearSession()` | Profile logout | No | Yes | No |
| `saved-accounts.tsx` `if (isActive) await clearSession()` | removing the **active** saved account | No | Yes | No |
| `session.ts` `restoreSession()` no-credentials → `clearSession()` | launch | Runs, but **before `<Stack>` mounts** (root layout gates on `sessionRestored`), so AuthGuard does not exist yet | Yes | No |
| `expireSession()` | AuthGuard 60 s sweep | Inert at the 30-day TTL (R1) | Yes | No |
| `setSession()` | `LoginForm`, `commitPendingSwitch` | Yes | — | **Yes — the only path that revives auth** |

**A tension worth recording rather than resolving by assumption:** because `sessionInvalidated` latches and only `setSession` clears it, a 401 teardown predicts the cycle **stops** at the first hop (a fresh `index` would read unauthenticated and render the login form). But the stale-closure explanation still requires a committed render that observed `isAuthenticated() === false` at `/home`. **Each candidate contradicts some piece of source evidence**, so at least one assumption in the chain is wrong. Only a renderId-correlated trace can say which. **This is why the fix was chosen to be independent of the answer.**

### D.3 Why `Stack.Protected` was NOT used — **PROVEN, source-level**

`layouts/StackClient.js:50` calls `withLayoutContext(NativeStackNavigator)` with **no third argument**, so `useOnlyUserDefinedScreens` defaults to `false` (`layouts/withLayoutContext.js:145`). `useSortedScreens` (`useScreens.js:121-131`) therefore takes **all** filesystem route children and removes only those whose names appear in `protectedScreens` — the set built from screens **explicitly declared inside** a `<Stack.Protected>`.

The repository has **97 route files across 18 top-level route directories**, and `app/_layout.tsx` explicitly declares **4** screens. So `<Stack.Protected guard={authed}><Stack.Screen name="(tabs)" /></Stack.Protected>` would leave every module route (`/bookings/*`, `/attractions/*`, `/payments/*`, …) **auto-registered and unprotected** — a security and behaviour regression relative to today's `AuthGuard`, which covers every non-public route.

Making it correct requires either declaring ~93 additional screens in the root layout, or relocating 18 directories into an `app/(protected)/` group — touching ~93 files and their relative imports. **Neither is a clean fit**, so per the brief the defensive fix was implemented instead. `Stack.Protected` remains the right long-term target **if** the route tree is first reorganised into a protected group; that is a separate, planned piece of work, not a bug fix.

The anchor (`unstable_settings.initialRouteName: "splash"`) was **deliberately left unchanged** — it only needs revisiting for the `Stack.Protected` architecture, and F5 is disproven, so there is no evidence-backed model of its effect to justify touching it now.

### D.4 The fix — three coordinated changes

**1. `src/components/AuthGuard.tsx` — revalidate the premise at the moment of the irreversible action.**

```ts
if (!redirectedRef.current) {
  if (isAuthenticated()) { /* log + */ return; }   // ← added
  redirectedRef.current = true;
  ...
  router.replace("/");
}
```

This is not a suppression flag: it re-reads the **source of truth**, and it is the same source `useAuthStatus()` reads at render. It closes the C.1 window — `setSession` assigns the module token synchronously (`session.ts:75-81`) but notifies React only after three awaited SecureStore writes (`:108`), so a render committed inside that window carries an `authed` that is stale by the time its passive effect runs. Because navigation is irreversible (C.2), the premise must hold *when the action is taken*, not when it was captured.

**2. `src/app/index.tsx` — remove the second navigation authority.**

`authedAtMount` and `<Redirect href="/home">` are deleted. The login screen now owns **no** authenticated navigation. This removes the proven sustaining half of the cycle (§2 / B.8) and one of the two `<Redirect>` elements that re-fire every render (F2).

**3. `src/app/splash.tsx` — the hand-off decides the destination.**

`router.replace("/")` becomes `router.replace(isAuthenticated() ? "/home" : "/")`. The root layout renders nothing until `restoreSession()` and (for a stored token) `validateStoredSession()` have settled, so the session is authoritative at hand-off. This preserves the **only** case change 2 removed — an already-signed-in cold start — and does it in one one-shot decision rather than a per-render `<Redirect>`.

### D.5 Why this eliminates the cycle rather than hiding the error

The crash needs **both** halves. Change 2 removes the sustaining half outright: nothing navigates `/ → /home` on behalf of a snapshot any more, so even a spurious redirect terminates at the login screen instead of bouncing. Change 1 removes the immediate trigger, so a valid session is not redirected in the first place. Neither adds a delay, a counter, a pathname test, or an error suppression, and the `Maximum update depth` counter is never addressed directly — the navigation that fed it is.

Honest limit: change 1 **narrows** the window to the gap between the live check and the `replace()` call rather than eliminating it. That residual race is only closable by taking navigation out of the passive effect entirely — which is Fix B, blocked on the route-tree reorganisation in D.3.

### D.6 Status changes

| Item | Before | After | Why |
|---|---|---|---|
| Sustaining mechanism (two authorities) | PROVEN | **PROVEN — now removed** | Change 2 |
| F9 | NEEDS VERIFICATION | **NEEDS VERIFICATION** | Not reproduced; unchanged |
| B.7 | NEEDS VERIFICATION | **NEEDS VERIFICATION** | Not identified; D.2 records the tension |
| F5 (original direction) | DISPROVEN | **DISPROVEN** | Unchanged; not revived |
| F9b (notify lags mutation) | PROVEN | **PROVEN** | Unchanged |
| Fix B viability | assumed clean | **REJECTED for now** | D.3, source-level |

### D.7 Regression status — **NOT EXECUTED**

T1–T13 **cannot be run here** (no device/emulator). Static verification only:

- `npx tsc --noEmit` — clean.
- `npx eslint src/` — 2 errors, both **pre-existing** in `src/components/ui/DashboardHeader.tsx` (unescaped apostrophes), confirmed by linting the stashed clean tree. Changed files lint clean.
- `git diff` — dependency array in `AuthGuard.tsx` byte-identical to original; no unrelated files touched.

**T1–T13 must be run on a device before this is considered fixed.** Highest-risk cases given these changes: **T3** (cold start with stored session — now served by the splash hand-off, a newly exercised path), **T5** (`/switch-account`), **T8** (splash replay), and **T12** (failed login must not reach `/home`).

### D.8 Instrumentation retained

The `[AUTH-DEBUG]` instrumentation is **deliberately kept** so the fix can be verified on-device and F9/B.7 can still be closed. Removal is one command (Appendix A). Remove it once T1–T13 pass.

---

*Appendices A–C are investigation-only. **Appendix D changes application behaviour** (three files: `AuthGuard.tsx`, `index.tsx`, `splash.tsx`). Line references in Sections 1–16 are against commit `134bdfe` on branch `main`. Router internals were quoted from `node_modules/expo-router/build` at version `55.0.17`.*
