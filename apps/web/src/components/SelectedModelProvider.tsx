import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DEFAULT_MODEL } from '../lib/api'

const STORAGE_KEY = 'selectedModel'

interface SelectedModelContextValue {
  model: string
  setModel: (model: string) => void
}

const SelectedModelContext = createContext<SelectedModelContextValue | undefined>(undefined)

export function SelectedModelProvider({ children }: { children: React.ReactNode }) {
  const [model, setModelState] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODEL
    } catch {
      return DEFAULT_MODEL
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, model)
    } catch {
      // ignore
    }
  }, [model])

  const setModel = useCallback((next: string) => setModelState(next), [])

  return (
    <SelectedModelContext.Provider value={{ model, setModel }}>
      {children}
    </SelectedModelContext.Provider>
  )
}

export function useSelectedModel() {
  const ctx = useContext(SelectedModelContext)
  if (!ctx) {
    throw new Error('useSelectedModel must be used within a SelectedModelProvider')
  }
  return ctx
}
