import { app, powerMonitor } from 'electron';
import type { LoginItemPort, PowerMonitorPort } from './adapters';

/** Registers mboard as a macOS login item. */
export const electronLoginItem: LoginItemPort = {
  setOpenAtLogin(enabled) {
    app.setLoginItemSettings({ openAtLogin: enabled });
  },
};

/** Reports the Mac waking from sleep through Electron's `powerMonitor`. */
export const electronPowerMonitor: PowerMonitorPort = {
  onResume(listener) {
    powerMonitor.on('resume', listener);
    return () => {
      powerMonitor.off('resume', listener);
    };
  },
};
