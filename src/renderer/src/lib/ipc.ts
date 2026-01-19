/**
 * IPC Services for Renderer Process
 *
 * This file provides a convenient way to access IPC services in renderer process.
 * All services are type-safe and automatically generated from the main process.
 *
 * Usage:
 * import { ipcServices, ipcEvents } from '@renderer/lib/ipc'
 *
 * const version = await ipcServices.app.getAppVersion()
 * const info = await ipcServices.app.getAppInfo()
 * await ipcServices.app.switchAppLocale('zh-CN')
 *
 * // Event listening
 * const unsubscribe = ipcEvents.on('download:started', (id: string) => {
 *   console.log('Download started:', id)
 * })
 * ipcEvents.removeListener('download:started', unsubscribe)
 */

import type { IpcServices } from '@shared/types/ipc'

import { createIpcProxy } from 'electron-ipc-decorator/client'

const isElectron = window?.api

const servicesProxy = createIpcProxy<IpcServices>(
  window.electron?.ipcRenderer as unknown as Electron.IpcRenderer
) as NonNullable<ReturnType<typeof createIpcProxy<IpcServices>>>

export const isWebMode = !isElectron

// In web mode, provide stub services that log warnings
export const ipcServices = isElectron
  ? servicesProxy
  : ({
      app: {
        getPlatform: async () => 'web',
        getVersion: async () => '1.0.0-web'
      },
      settings: {
        getAll: async () => ({}),
        get: async () => undefined,
        set: async () => {}
      },
      download: {
        getVideoInfo: async () => {
          console.warn('Download service not available in web mode')
          throw new Error('Download service requires Electron or backend server')
        },
        getPlaylistInfo: async () => {
          console.warn('Download service not available in web mode')
          throw new Error('Download service requires Electron or backend server')
        },
        startDownload: async () => {
          console.warn('Download service not available in web mode')
          throw new Error('Download service requires Electron or backend server')
        },
        cancelDownload: async () => {},
        getQueue: async () => ({ active: [], status: {} }),
        getActiveDownloads: async () => []
      },
      history: {
        getHistory: async () => [],
        getCount: async () => ({ active: 0, completed: 0, error: 0, cancelled: 0, total: 0 }),
        getHistoryById: async () => undefined,
        addHistoryItem: async () => {},
        removeHistoryItems: async () => 0,
        removeHistoryByPlaylistId: async () => 0,
        clearHistory: async () => {}
      },
      subscriptions: {
        list: async () => [],
        getAll: async () => [],
        create: async () => undefined,
        update: async () => undefined,
        remove: async () => {},
        refreshAll: async () => {},
        refresh: async () => {},
        queueItem: async () => {},
        getFeedItems: async () => [],
        resolve: async () => {
          console.warn('Subscription resolve not available in web mode')
          throw new Error('Subscription resolve requires backend server')
        }
      },
      fs: {
        selectDirectory: async () => '',
        selectFile: async () => '',
        deleteFile: async () => false,
        openExternal: async (url: string) => window.open(url, '_blank'),
        showItemInFolder: async () => {}
      },
      window: {
        minimize: async () => {},
        maximize: async () => {},
        close: async () => {}
      },
      browserCookies: {
        getBrowserProfilePath: async () => '',
        validateBrowserProfilePath: async () => ({ valid: false, reason: 'not-supported' })
      },
      update: {
        checkForUpdates: async () => ({ available: false }),
        quitAndInstall: async () => {}
      },
      thumbnail: {
        getThumbnail: async (url: string) => url
      }
    } as unknown as IpcServices)

export const ipcEvents = isElectron
  ? {
      on: (channel: string, callback: (...args: unknown[]) => void) => {
        return window.api.on(channel, callback)
      },
      removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
        window.api.removeListener(channel, callback)
      },
      send: (channel: string, ...args: unknown[]) => {
        window.api.send(channel, ...args)
      }
    }
  : {
      on: () => () => {},
      removeListener: () => {},
      send: () => {}
    }

export type { IpcServices }
