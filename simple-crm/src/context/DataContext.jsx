import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { loadData, saveData, resetData, clearData, uid } from '../lib/store'

const DataContext = createContext(null)

const COLLECTIONS = ['contacts', 'leads', 'deals', 'meetings', 'activities']

export function DataProvider({ children }) {
  const [data, setData] = useState(() => loadData())

  useEffect(() => {
    saveData(data)
  }, [data])

  function logActivity(type, text) {
    setData((d) => ({
      ...d,
      activities: [
        { id: uid(), type, text, createdAt: new Date().toISOString() },
        ...d.activities,
      ].slice(0, 50),
    }))
  }

  function addItem(collection, item, activity) {
    const record = { id: uid(), createdAt: new Date().toISOString(), ...item }
    setData((d) => ({ ...d, [collection]: [record, ...d[collection]] }))
    if (activity) logActivity(collection.replace(/s$/, ''), activity)
    return record
  }

  function updateItem(collection, id, patch, activity) {
    setData((d) => ({
      ...d,
      [collection]: d[collection].map((it) =>
        it.id === id ? { ...it, ...patch } : it
      ),
    }))
    if (activity) logActivity(collection.replace(/s$/, ''), activity)
  }

  function removeItem(collection, id, activity) {
    setData((d) => ({
      ...d,
      [collection]: d[collection].filter((it) => it.id !== id),
    }))
    if (activity) logActivity(collection.replace(/s$/, ''), activity)
  }

  function reseed() {
    setData(resetData())
  }

  function wipe() {
    setData(clearData())
  }

  const stats = useMemo(() => {
    const activeDeals = data.deals.filter(
      (d) => d.stage !== 'Won' && d.stage !== 'Lost'
    )
    const wonRevenue = data.deals
      .filter((d) => d.stage === 'Won')
      .reduce((sum, d) => sum + (Number(d.value) || 0), 0)
    const now = new Date()
    const weekEnd = new Date(now.getTime() + 7 * 86400000)
    const meetingsThisWeek = data.meetings.filter((m) => {
      const t = new Date(m.date).getTime()
      return t >= now.getTime() && t <= weekEnd.getTime()
    }).length

    return {
      totalLeads: data.leads.length,
      activeDeals: activeDeals.length,
      wonRevenue,
      pipelineValue: activeDeals.reduce((s, d) => s + (Number(d.value) || 0), 0),
      meetingsThisWeek,
    }
  }, [data])

  const value = {
    ...Object.fromEntries(COLLECTIONS.map((c) => [c, data[c]])),
    stats,
    addItem,
    updateItem,
    removeItem,
    logActivity,
    reseed,
    wipe,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside a DataProvider')
  return ctx
}
