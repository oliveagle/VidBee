/**
 * Web API Client for VidBee Web Interface
 *
 * This client provides a type-safe interface to the VidBee backend API
 * when running in web mode (without Electron).
 */

import type {
  DownloadItem,
  DownloadOptions,
  PlaylistInfo,
  VideoInfo,
  VideoInfoCommandResult
} from '@shared/types'

const API_BASE_URL = window.location.origin

const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const url = `${API_BASE_URL}${path}`
  console.log(`Web API Request: ${options.method || 'GET'} ${url}`)

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  })

  console.log(
    `Web API Response: ${url} - status: ${response.status}, content-type: ${response.headers.get('content-type')}`
  )

  if (!response.ok) {
    // Try to parse as JSON error response
    const contentType = response.headers.get('content-type')
    const text = await response.text().catch(() => 'Failed to read response body')
    console.error(`Web API Error Response:`, {
      url,
      status: response.status,
      contentType,
      body: text.slice(0, 500)
    })

    if (contentType?.includes('application/json')) {
      try {
        const error = JSON.parse(text)
        throw new Error(error.error || `HTTP ${response.status}`)
      } catch {
        throw new Error(text.slice(0, 200) || `HTTP ${response.status}`)
      }
    }
    // For non-JSON responses (like HTML error pages), extract a simple message
    throw new Error(`Server error (${response.status}): ${text.slice(0, 100)}`)
  }

  const json = await response.json()
  console.log(`Web API Success: ${url}`)
  return json
}

const apiClient = {
  app: {
    getVersion: (): Promise<{ version: string }> => request('/api/app/version'),
    getStatus: (): Promise<{ ok: boolean }> => request('/api/app/status')
  },

  settings: {
    getAll: (): Promise<Record<string, unknown>> => request('/api/settings'),
    get: <K extends string>(key: K): Promise<{ value: unknown }> => request(`/api/settings/${key}`),
    set: <K extends string>(key: K, value: unknown): Promise<{ success: boolean }> =>
      request(`/api/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value })
      })
  },

  download: {
    getVideoInfo: (url: string): Promise<VideoInfo> =>
      request(`/api/download/video-info?url=${encodeURIComponent(url)}`),
    getVideoInfoWithCommand: (url: string): Promise<VideoInfoCommandResult> =>
      request(`/api/download/video-info-with-command?url=${encodeURIComponent(url)}`),
    getPlaylistInfo: (url: string): Promise<PlaylistInfo> =>
      request(`/api/download/playlist-info?url=${encodeURIComponent(url)}`),
    getQueue: (): Promise<{ active: DownloadItem[]; status: unknown }> =>
      request('/api/download/queue'),
    startDownload: (
      id: string,
      options: DownloadOptions
    ): Promise<{ success: boolean; id: string }> =>
      request(`/api/download/${id}`, {
        method: 'POST',
        body: JSON.stringify(options)
      }),
    cancelDownload: (id: string): Promise<{ success: boolean }> =>
      request(`/api/download/${id}`, {
        method: 'DELETE'
      })
  },

  history: {
    getHistory: (): Promise<unknown[]> => request('/api/history'),
    getCount: (): Promise<unknown> => request('/api/history/count'),
    removeItem: (id: string): Promise<{ success: boolean }> =>
      request(`/api/history/${id}`, {
        method: 'DELETE'
      }),
    clear: (): Promise<{ success: boolean }> =>
      request('/api/history/clear', {
        method: 'DELETE'
      })
  },

  subscriptions: {
    list: (): Promise<unknown[]> => request('/api/subscriptions'),
    create: (options: unknown): Promise<unknown> =>
      request('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify(options)
      }),
    update: (id: string, updates: unknown): Promise<unknown> =>
      request(`/api/subscriptions/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
      }),
    remove: (id: string): Promise<{ success: boolean }> =>
      request(`/api/subscriptions/${id}`, {
        method: 'DELETE'
      }),
    refreshAll: (): Promise<{ success: boolean }> =>
      request('/api/subscriptions/refresh', {
        method: 'POST'
      }),
    refresh: (id: string): Promise<{ success: boolean }> =>
      request(`/api/subscriptions/${id}/refresh`, {
        method: 'POST'
      })
  }
}

export { apiClient }
