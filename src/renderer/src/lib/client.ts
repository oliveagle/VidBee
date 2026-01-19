/**
 * Unified VidBee Client
 *
 * Automatically uses IPC in Electron mode or Web API in web mode.
 */

import type {
  DownloadOptions,
  PlaylistInfo,
  SubscriptionCreatePayload,
  SubscriptionUpdatePayload,
  VideoInfo
} from '@shared/types'
import { ipcEvents, ipcServices } from './ipc'
import { apiClient } from './web-api'

const isWebMode = !window.api

export const client = {
  app: {
    getVersion: async () => {
      if (isWebMode) {
        const result = await apiClient.app.getVersion()
        return result.version
      }
      return ipcServices?.app.getVersion() || ''
    },

    getStatus: async () => {
      if (isWebMode) {
        return apiClient.app.getStatus()
      }
      return ipcServices?.app.getOsVersion() || ''
    }
  },

  settings: {
    getAll: async () => {
      if (isWebMode) {
        return apiClient.settings.getAll()
      }
      return ipcServices?.settings.getAll() || {}
    },

    get: async <K extends string>(key: K) => {
      if (isWebMode) {
        const result = await apiClient.settings.get(key)
        return result.value
      }
      return ipcServices?.settings.get(key as never)
    },

    set: async <K extends string>(key: K, value: unknown) => {
      if (isWebMode) {
        await apiClient.settings.set(key, value)
      } else if (ipcServices) {
        ipcServices.settings.set(key as never, value as never)
      }
    }
  },

  download: {
    getVideoInfo: async (url: string): Promise<VideoInfo> => {
      if (isWebMode) {
        return apiClient.download.getVideoInfo(url)
      }
      return ipcServices?.download.getVideoInfo(url) as Promise<VideoInfo>
    },

    getPlaylistInfo: async (url: string): Promise<PlaylistInfo> => {
      if (isWebMode) {
        return apiClient.download.getPlaylistInfo(url)
      }
      return ipcServices?.download.getPlaylistInfo(url) as Promise<PlaylistInfo>
    },

    getQueue: async () => {
      if (isWebMode) {
        return apiClient.download.getQueue()
      }
      return {
        active: ipcServices?.download.getActiveDownloads() || [],
        status: ipcServices?.download.getQueueStatus()
      }
    },

    startDownload: async (id: string, options: DownloadOptions) => {
      if (isWebMode) {
        return apiClient.download.startDownload(id, options)
      }
      ipcServices?.download.startDownload(id, options)
      return { success: true, id }
    },

    cancelDownload: async (id: string) => {
      if (isWebMode) {
        return apiClient.download.cancelDownload(id)
      }
      const result = ipcServices?.download.cancelDownload(id)
      return { success: !!result }
    }
  },

  history: {
    getHistory: async () => {
      if (isWebMode) {
        return apiClient.history.getHistory()
      }
      return ipcServices?.history.getHistory() || []
    },

    getCount: async () => {
      if (isWebMode) {
        return apiClient.history.getCount()
      }
      return ipcServices?.history.getHistoryCount()
    },

    removeItem: async (id: string) => {
      if (isWebMode) {
        return apiClient.history.removeItem(id)
      }
      const result = ipcServices?.history.removeHistoryItem(id)
      return { success: !!result }
    },

    clear: async () => {
      if (isWebMode) {
        return apiClient.history.clear()
      }
      ipcServices?.history.clearHistory()
      return { success: true }
    }
  },

  subscriptions: {
    list: async () => {
      if (isWebMode) {
        return apiClient.subscriptions.list()
      }
      return ipcServices?.subscriptions.list() || []
    },

    create: async (options: SubscriptionCreatePayload & { url: string }) => {
      if (isWebMode) {
        return apiClient.subscriptions.create(options)
      }
      return ipcServices?.subscriptions.create(options)
    },

    update: async (id: string, updates: SubscriptionUpdatePayload) => {
      if (isWebMode) {
        return apiClient.subscriptions.update(id, updates)
      }
      return ipcServices?.subscriptions.update(id, updates)
    },

    remove: async (id: string) => {
      if (isWebMode) {
        return apiClient.subscriptions.remove(id)
      }
      const result = ipcServices?.subscriptions.remove(id)
      return { success: !!result }
    },

    refreshAll: async () => {
      if (isWebMode) {
        return apiClient.subscriptions.refreshAll()
      }
      await ipcServices?.subscriptions.refresh()
      return { success: true }
    },

    refresh: async (id: string) => {
      if (isWebMode) {
        return apiClient.subscriptions.refresh(id)
      }
      await ipcServices?.subscriptions.refresh(id)
      return { success: true }
    }
  }
}

export const events = ipcEvents
