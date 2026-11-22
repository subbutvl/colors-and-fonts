# Testing Huetype on a Mac

CI builds and tests Huetype on macOS, but it cannot click, see windows or grant permissions. Run through this list on a real Mac (Apple silicon, macOS 11 or later) with the `.dmg` from the Release workflow before publishing a release with Mac changes. Note anything that fails with the macOS version and your display setup (built-in only, or which external monitors and their scaling).

## Install and launch

- [ ] Open the `.dmg`, drag Huetype to Applications, launch it. The first launch is blocked; **System Settings > Privacy & Security > Open Anyway** lets it start.
- [ ] The window has native red, yellow and green buttons at the top left, not overlapping the Huetype logo. Only close and minimize work (the window has a fixed size).
- [ ] A Dock icon shows while the window is open.
- [ ] Closing the window hides it: the Dock icon goes away and the menu bar icon stays.
- [ ] The menu bar icon is a one-color mark that matches a light and a dark menu bar. Clicking it opens the menu.
- [ ] Menu items show shortcuts as ⌃⌥C, ⌃⌥F, ⌃⌥Space, with a gap before them.
- [ ] **Open Huetype** in the menu, and clicking the Dock icon (when shown), bring the window back.
- [ ] **Quit Huetype** exits.
- [ ] Settings > Launch at startup: turn it on, log out and in. Huetype starts with only the menu bar icon, no window and no Dock icon.

## Screen Recording permission

- [ ] Settings shows a **Permissions** group saying Screen Recording is "Not allowed yet" before the first pick.
- [ ] The first ⌃⌥C shows the macOS prompt once and no overlay. Picker home shows the error and an **Open System Settings** button, which opens the Screen Recording pane.
- [ ] After turning Huetype on (macOS may ask to quit and reopen), the Settings row says "Allowed" when you come back to the window.

## Picking colors

- [ ] ⌃⌥C covers the whole screen, including the menu bar and the Dock, with the frozen image and the loupe.
- [ ] Picked colors are exact: pick a known swatch (for example a CSS `#5B6CFF` square in a browser) and compare the HEX. Try a 1 px line to check the loupe lines up with the pointer on Retina.
- [ ] Click picks and keeps the session open; Shift+drag averages; arrows nudge; Enter picks; Esc and right-click end it. The session bar at the bottom works.
- [ ] With an external monitor (ideally one at a different scaling from the built-in screen): each screen gets its own overlay, and picks are exact on both.
- [ ] With a full-screen app in front (for example a full-screen Safari window), ⌃⌥C still covers it.
- [ ] Switch to another Space (desktop) and pick there.
- [ ] ⌃⌥Space shows the toolbar above other windows, including over a full-screen app; its swatch popovers open and close.
- [ ] Recent colors in the menu bar menu lists picks and copies on click.
- [ ] Image palette > grab screen captures the screen under the main window.

## Identifying fonts

- [ ] ⌃⌥F, drag a box over a line of text in a browser (Inter, Roboto or Open Sans at 16 to 24 px). The Identify page opens with the recognized words and a match.
- [ ] Words are boxed in the right places on the captured image.
- [ ] A box with no text says "No text was found in the box", without an error.

## Shortcuts and wording

- [ ] Settings > Shortcuts shows ⌃⌥ labels; rebinding to a new combination works, and a combination with no modifier is refused with the Control, Option, Shift or Command wording.
- [ ] Text in Settings, Picker home and Image palette says menu bar (not tray), ⌘V (not Ctrl+V) and macOS (not Windows).

## Updating

- [ ] Install a newer `.dmg` over the old app. Saved colors, palettes and settings are still there. macOS may ask for Screen Recording again because builds are not signed with a Developer ID.
