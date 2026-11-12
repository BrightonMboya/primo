import { useSyncExternalStore } from 'react'
import type { CartItem } from './types'

/** Items being sold / sent out, plus any exchange credit. Lives on this phone only. */
export type Credit = { refundId: number; amount: number; customerName: string; customerPhone: string }
type CartState = { items: CartItem[]; credit: Credit | null }

const KEY = 'primo.cart'
const empty: CartState = { items: [], credit: null }
let state: CartState = empty
const listeners = new Set<() => void>()

function load() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) state = JSON.parse(raw)
  } catch {}
}
let loaded = false

function save(next: CartState) {
  state = next
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next))
  } catch {}
  listeners.forEach((l) => l())
}

export const cart = {
  get: () => {
    if (!loaded) {
      load()
      loaded = true
    }
    return state
  },
  add(item: CartItem) {
    save({ ...cart.get(), items: [...cart.get().items, item] })
  },
  removeAt(index: number) {
    save({ ...cart.get(), items: cart.get().items.filter((_, i) => i !== index) })
  },
  setCredit(credit: Credit | null) {
    save({ ...cart.get(), credit })
  },
  clear() {
    save(empty)
  },
}

export function useCart(): CartState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    cart.get,
    () => empty,
  )
}
