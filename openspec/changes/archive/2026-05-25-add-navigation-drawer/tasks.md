## 1. Navigation Dependencies

- [x] 1.1 Confirm the Expo Router drawer integration requirements for the installed Expo Router version.
- [x] 1.2 Add required drawer, gesture, and icon dependencies to the app/root package manifests.
- [x] 1.3 Verify dependency installation updates the lockfile consistently.

## 2. Drawer Shell

- [x] 2.1 Replace the root stack shell with a drawer-capable Expo Router layout.
- [x] 2.2 Preserve the existing index route and foundation home screen within the drawer shell.
- [x] 2.3 Add route entries for the add-tracker and settings drawer destinations.

## 3. Drawer Presentation

- [x] 3.1 Create reusable drawer content modules under `src` for sections and submenu items.
- [x] 3.2 Render a `Goal settings` section with an `Add tracker` item and tracker-style icon.
- [x] 3.3 Render an `Options` section with a `Settings` item and settings icon.
- [x] 3.4 Wire drawer item activation to the add-tracker and settings routes.

## 4. Destination Screens

- [x] 4.1 Add a lightweight add-tracker destination screen that can be reached from the drawer.
- [x] 4.2 Add a lightweight settings destination screen that can be reached from the drawer.
- [x] 4.3 Keep placeholder screen copy minimal and avoid implementing full tracker/settings workflows.

## 5. Verification

- [x] 5.1 Add focused tests for drawer sections, drawer items, icons, and route activation.
- [x] 5.2 Run typecheck, lint, and test workflows for the Expo app.
- [x] 5.3 Start Expo web and verify the drawer shell renders without startup errors.
