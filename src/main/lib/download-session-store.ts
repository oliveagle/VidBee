import { inArray } from 'drizzle-orm'
import type { DownloadItem, DownloadOptions } from '../../shared/types'
import { downloadHistoryTable } from './database/schema'
import { historyManager } from './history-manager'

export interface DownloadSessionItem {
  id: string
  options: DownloadOptions
  item: DownloadItem
}

const ACTIVE_STATUSES = ['pending', 'downloading'] as const

const isValidItem = (item: DownloadSessionItem): boolean =>
  Boolean(item?.id && item.options && item.item)

export const loadDownloadSession = (): DownloadSessionItem[] => {
  try {
    const db = historyManager.getDatabase()
    if (!db) {
      console.warn('[Session] Database not available')
      return []
    }
    console.log('[Session] Loading active downloads from database...')

    const rows = db
      .select({
        id: downloadHistoryTable.id,
        url: downloadHistoryTable.url,
        title: downloadHistoryTable.title,
        thumbnail: downloadHistoryTable.thumbnail,
        type: downloadHistoryTable.type,
        status: downloadHistoryTable.status,
        downloadPath: downloadHistoryTable.downloadPath,
        savedFileName: downloadHistoryTable.savedFileName,
        fileSize: downloadHistoryTable.fileSize,
        duration: downloadHistoryTable.duration,
        downloadedAt: downloadHistoryTable.downloadedAt,
        completedAt: downloadHistoryTable.completedAt,
        error: downloadHistoryTable.error,
        ytDlpCommand: downloadHistoryTable.ytDlpCommand,
        description: downloadHistoryTable.description,
        channel: downloadHistoryTable.channel,
        uploader: downloadHistoryTable.uploader,
        viewCount: downloadHistoryTable.viewCount,
        tags: downloadHistoryTable.tags,
        origin: downloadHistoryTable.origin,
        subscriptionId: downloadHistoryTable.subscriptionId,
        selectedFormat: downloadHistoryTable.selectedFormat,
        playlistId: downloadHistoryTable.playlistId,
        playlistTitle: downloadHistoryTable.playlistTitle,
        playlistIndex: downloadHistoryTable.playlistIndex,
        playlistSize: downloadHistoryTable.playlistSize,
        options: downloadHistoryTable.options
      })
      .from(downloadHistoryTable)
      .where(inArray(downloadHistoryTable.status, [...ACTIVE_STATUSES]))
      .all()

    console.log(`[Session] Found ${rows.length} active downloads in database`)
    rows.forEach((row) => {
      console.log(`[Session] - ${row.id}: ${row.status} (${row.title})`)
    })

    return rows
      .map((row) => {
        try {
          const options: DownloadOptions = row.options
            ? JSON.parse(row.options)
            : { url: row.url, type: row.type as 'video' | 'audio' }

          const item: DownloadItem = {
            id: row.id,
            url: row.url,
            title: row.title,
            thumbnail: row.thumbnail ?? undefined,
            type: row.type as 'video' | 'audio',
            status: row.status as DownloadItem['status'],
            progress: { percent: 0 },
            createdAt: row.downloadedAt,
            completedAt: row.completedAt ?? undefined,
            fileSize: row.fileSize ?? undefined,
            speed: ''
          }

          return { id: row.id, options, item }
        } catch {
          return null
        }
      })
      .filter((item): item is DownloadSessionItem => item !== null && isValidItem(item))
  } catch (error) {
    console.warn('Failed to load download session from database:', error)
    return []
  }
}

export const saveDownloadSession = (items: DownloadSessionItem[]): void => {
  try {
    const db = historyManager.getDatabase()
    if (!db) {
      return
    }

    if (items.length === 0) {
      db.delete(downloadHistoryTable)
        .where(inArray(downloadHistoryTable.status, [...ACTIVE_STATUSES]))
        .run()
      return
    }

    db.delete(downloadHistoryTable)
      .where(inArray(downloadHistoryTable.status, [...ACTIVE_STATUSES]))
      .run()

    for (const entry of items) {
      if (!isValidItem(entry)) {
        continue
      }

      const row = {
        id: entry.id,
        url: entry.options.url,
        title: entry.item.title || 'Unknown',
        thumbnail: entry.item.thumbnail || null,
        type: entry.item.type,
        status: entry.item.status,
        downloadPath: entry.options.customDownloadPath || null,
        savedFileName: entry.item.savedFileName || null,
        fileSize: entry.item.fileSize || null,
        duration: entry.item.duration || null,
        downloadedAt: entry.item.createdAt,
        completedAt: entry.item.completedAt || null,
        sortKey: entry.item.createdAt,
        error: entry.item.error || null,
        ytDlpCommand: entry.item.ytDlpCommand || null,
        description: entry.item.description || null,
        channel: entry.item.channel || null,
        uploader: entry.item.uploader || null,
        viewCount: entry.item.viewCount || null,
        tags: entry.item.tags?.join('\n') || null,
        origin: entry.item.origin || null,
        subscriptionId: entry.item.subscriptionId || null,
        selectedFormat: entry.item.selectedFormat
          ? JSON.stringify(entry.item.selectedFormat)
          : null,
        playlistId: entry.item.playlistId || null,
        playlistTitle: entry.item.playlistTitle || null,
        playlistIndex: entry.item.playlistIndex || null,
        playlistSize: entry.item.playlistSize || null,
        options: JSON.stringify(entry.options)
      }

      db.insert(downloadHistoryTable)
        .values(row)
        .onConflictDoUpdate({
          target: downloadHistoryTable.id,
          set: row
        })
        .run()
    }
  } catch (error) {
    console.warn('Failed to save download session to database:', error)
  }
}
