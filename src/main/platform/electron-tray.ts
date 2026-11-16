import { Menu, nativeImage, Tray, type NativeImage } from 'electron';
import type { TrayMenuItem, TrayPort } from './adapters';
import { renderTrayIconPng, TRAY_ICON_SIZES } from './tray-icon';

const [STANDARD_SIZE, RETINA_SIZE] = TRAY_ICON_SIZES;

/** Builds the template tray image: a 1x and a 2x rendition drawn in code, tinted by macOS for the menu bar. */
export function createTrayImage(): NativeImage {
  const image = nativeImage.createFromBuffer(renderTrayIconPng(STANDARD_SIZE), { scaleFactor: 1 });
  image.addRepresentation({ scaleFactor: 2, buffer: renderTrayIconPng(RETINA_SIZE) });
  image.setTemplateImage(true);
  return image;
}

/** The menu-bar item, backed by Electron's `Tray`. Holds the only reference so it isn't garbage collected. */
export function createElectronTray(): TrayPort {
  const tray = new Tray(createTrayImage());
  tray.setToolTip('mboard');
  let title = '';
  return {
    setTitle(next) {
      if (next === title) return;
      title = next;
      tray.setTitle(next);
    },
    setMenu(items: readonly TrayMenuItem[]) {
      tray.setContextMenu(Menu.buildFromTemplate([...items]));
    },
    destroy() {
      tray.destroy();
    },
  };
}
