import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  EVENT_SUBSCRIBERS,
  IPC,
  type EventName,
  type InvokeMethod,
  type MboardApi,
  type MboardEventPayloads,
} from '../shared/contract';

const REMOTE_ERROR_PREFIX = /^Error invoking remote method '[^']*': (?:Error: )?/;

/**
 * Turns a rejected `ipcRenderer.invoke` into an `Error` carrying only main's user-presentable message.
 */
function userPresentableError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message.replace(REMOTE_ERROR_PREFIX, ''));
}

function invoker(method: InvokeMethod): (...args: unknown[]) => Promise<unknown> {
  const channel = IPC.invoke[method];
  return async (...args: unknown[]) => {
    try {
      return await ipcRenderer.invoke(channel, ...args);
    } catch (error) {
      throw userPresentableError(error);
    }
  };
}

function subscriber<Event extends EventName>(
  event: Event,
): (listener: (payload: MboardEventPayloads[Event]) => void) => () => void {
  const channel = IPC.events[event];
  return (listener) => {
    const handler = (_event: IpcRendererEvent, payload: MboardEventPayloads[Event]) => listener(payload);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

/**
 * Builds `window.mboard` from the contract's channel map, so every method and event in
 * `src/shared/contract.ts` is bridged and nothing else is.
 */
function buildMboardApi(): MboardApi {
  const invokeMethods = Object.keys(IPC.invoke) as InvokeMethod[];
  const eventNames = Object.keys(EVENT_SUBSCRIBERS) as EventName[];
  return Object.fromEntries([
    ...invokeMethods.map((method) => [method, invoker(method)]),
    ...eventNames.map((event) => [EVENT_SUBSCRIBERS[event], subscriber(event)]),
  ]) as unknown as MboardApi;
}

contextBridge.exposeInMainWorld('mboard', buildMboardApi());
