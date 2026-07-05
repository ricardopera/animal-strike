# Esc / Pause Menu / Settings Layering Bug Fix Plan

**Goal:** Fix three related UX bugs: (1) pressing Esc during a match detaches the mouse with no menu and no way to re-aim; (2) the Settings panel opens behind the main menu; (3) ensure Esc opens a pause menu and closing it returns to the game with mouse-look re-acquired.

**Root causes:**
- No Escape key handler and no pause menu exist anywhere. The browser natively exits pointer lock on Esc, freeing the cursor and setting `input.pointerLocked=false`, but nothing shows a menu, nothing pauses, and `requestPointerLock()` is only called at match start — so the player is stranded.
- Settings panel is appended to uiRoot before MainMenu, so MainMenu (later DOM) stacks above it; Settings also has no z-index.

**Architecture:** Add a `PauseMenu` overlay (Resume / Settings / Leave). Add an Escape key handler in `Game` that toggles a paused state during an active match: show the pause menu, exit pointer lock; on Resume, hide the menu and re-request pointer lock. Give Settings + PauseMenu high z-index so they always stack above the MainMenu. Fix the frame loop to freeze sim/look while paused.

---

## Task 1: PauseMenu component + Settings z-index fix

**Files:** Create `src/ui/PauseMenu.js`; Modify `src/ui/Settings.js`

- Create `src/ui/PauseMenu.js`: a DOM overlay (inset:0, semi-transparent, high z-index=50, flex column centered) with three buttons: **Resume**, **Settings**, **Leave Match**. Constructor takes `{ onResume, onToggleSettings, onLeave }`. `show()` / `hide()` toggle display. Hidden by default. Styled to match EndScreen (system-ui, white text, #4dffb8 accent for Resume).

- Modify `src/ui/Settings.js`: add `z-index:60` to the `this.el.style.cssText` so Settings always stacks above the pause menu AND the main menu (main menu has no z-index so stays at default 0). This fixes bug #2.

- Commit.

## Task 2: Wire Esc → pause menu into Game, freeze sim while paused, re-lock on resume

**Files:** Modify `src/core/Game.js`

- In the constructor: create `this.pauseMenu = new PauseMenu(uiRoot, { onResume, onToggleSettings, onLeave })` near where MainMenu is created.
  - `onResume`: hide pause menu, set `this.paused=false`, and **re-request pointer lock** (`this.input.requestPointerLock()`) — this is the fix for "can't control view again."
  - `onToggleSettings`: `this.settings.toggle()`.
  - `onLeave`: `this.returnToMenu()` (existing method).

- Add an **Escape key handler** in the constructor:
  ```js
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape') return;
    if (this.match.active && !this.match.over && !this.menu.el.style.display.includes('flex')) {
      // Only toggle pause during an active match (not on main menu / end screen).
      this.paused = !this.paused;
      if (this.paused) {
        this.pauseMenu.show();
        if (document.pointerLockElement) document.exitPointerLock();
      } else {
        this.pauseMenu.hide();
        this.input.requestPointerLock();
      }
    }
  });
  ```

- Initialize `this.paused = false` in the constructor (near match state).

- In `frame(realDt)` and `frameMultiplayer(realDt)`: at the very top, add `if (this.paused) return;` so the sim + look + render-update freeze while paused (the renderer can still draw the last frame; we just skip the update). Actually, to keep rendering the frozen scene (so it's visible behind the dim overlay), skip only the sim/look/input parts but it's simplest to early-return before any state mutation — the overlay covers the screen anyway.

- The guard `!this.menu.el.style.display.includes('flex')` ensures Esc does nothing on the main menu (where it would be meaningless) and doesn't interfere with the end screen. The `match.active && !match.over` guard ensures Esc only pauses mid-match.

- Commit.

## Task 3: Verify + merge

- Run full test suite (`npx vitest run`) — existing 148 tests must stay green (pause logic is UI/DOM, not unit-tested logic).
- Runtime verify via dev server + Playwright: start a match, the viewmodel renders; the bug fix is confirmed by inspecting that the Escape handler + pauseMenu exist. (Full pointer-lock behavior can't be 100% verified in Playwright since it can't acquire pointer lock, but the handler wiring + z-index can be checked.)
- Merge to master + push.
