import { useSetAtom } from 'jotai'
import { useEffect } from 'react'
// import type { DownloadHistoryItem } from '../../../shared/types'
import { ipcServices } from '../lib/ipc'
import { addHistoryRecordAtom, clearHistoryRecordsAtom } from '../store/downloads'

export function useHistorySync() {
  const addHistoryItem = useSetAtom(addHistoryRecordAtom)
  const clearHistory = useSetAtom(clearHistoryRecordsAtom)

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const historyData = await ipcServices.history.getHistory()
        clearHistory()
        historyData.forEach((item) => {
          addHistoryItem(item)
        })
      } catch (error) {
        console.warn('Failed to load history:', error)
      }
    }

    loadHistory()
  }, [addHistoryItem, clearHistory])
}
