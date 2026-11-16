import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel, type MboardApi } from './bridge-contract';

const mboardApi: MboardApi = {
  ping: () => ipcRenderer.invoke(IpcChannel.ping),
};

contextBridge.exposeInMainWorld('mboard', mboardApi);
