import { app, Menu, type MenuItemConstructorOptions } from 'electron';

/** What the app menu's own items do. */
export interface AppMenuActions {
  openSettings(): void;
  changeBoardFolder(): void;
}

/**
 * Installs the macOS app menu: the app menu with **Settings…** (Cmd+, in its usual place after About),
 * **Change board folder…** and Quit, and the standard Edit and Window menus so undo, cut, copy, paste and
 * select all work in text fields and Cmd+W closes (hides) the window. Settings is a menu accelerator because
 * the renderer's own shortcuts ignore keys pressed with a modifier. Quit uses the `quit` role, which goes
 * through `app.quit()`.
 */
export function installAppMenu(actions: AppMenuActions): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => actions.openSettings() },
        { type: 'separator' },
        { label: 'Change board folder…', click: () => actions.changeBoardFolder() },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
