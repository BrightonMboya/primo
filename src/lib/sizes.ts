const ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', 'ONE SIZE']

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const ia = ORDER.indexOf(a.toUpperCase())
    const ib = ORDER.indexOf(b.toUpperCase())
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    const na = Number(a)
    const nb = Number(b)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.localeCompare(b)
  })
}

export function unique<T>(list: T[]): T[] {
  return [...new Set(list)]
}

export const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL']
