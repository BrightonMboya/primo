import { useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { saveNewProduct } from '~/server/app.functions'
import { toAmount } from '~/lib/format'
import { compressPhoto } from '~/lib/photo'
import { DEFAULT_SIZES } from '~/lib/sizes'
import { TopBar, useAction } from '~/components/ui'
import { useRefresh } from '~/lib/queries'

export const Route = createFileRoute('/_app/admin/new')({
  component: NewItem,
})

function NewItem() {
  const router = useRouter()
  const refresh = useRefresh()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState('')
  const [price, setPrice] = useState('')
  const [cost, setCost] = useState('')
  const [lowAt, setLowAt] = useState('2')
  const [colors, setColors] = useState<string[]>([])
  const [sizeOptions, setSizeOptions] = useState<string[]>(DEFAULT_SIZES)
  const [sizes, setSizes] = useState<string[]>(['S', 'M', 'L'])
  const [qty, setQty] = useState<Record<string, string>>({})
  const [fillAll, setFillAll] = useState('')
  const { busy, error, run, setError } = useAction()

  const key = (c: string, s: string) => `${c}__${s}`
  const orderedSizes = sizeOptions.filter((s) => sizes.includes(s))
  const total = colors.reduce((sum, c) => sum + orderedSizes.reduce((t, s) => t + (Number(qty[key(c, s)]) || 0), 0), 0)

  const [colorDraft, setColorDraft] = useState('')
  const [sizeDraft, setSizeDraft] = useState('')
  function addColor() {
    const c = colorDraft.trim()
    if (c && !colors.some((x) => x.toLowerCase() === c.toLowerCase())) setColors([...colors, c])
    setColorDraft('')
  }
  function addSize() {
    const s = sizeDraft.trim().toUpperCase()
    if (s) {
      if (!sizeOptions.includes(s)) setSizeOptions([...sizeOptions, s])
      if (!sizes.includes(s)) setSizes([...sizes, s])
    }
    setSizeDraft('')
  }
  function toggle(list: string[], value: string, set: (v: string[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return
    try {
      setPhoto(await compressPhoto(file))
    } catch {
      setError('Could not read that photo. Try another one.')
    }
  }

  async function save() {
    const variants = colors.flatMap((c) => orderedSizes.map((s) => ({ color: c, size: s, qty: Number(qty[key(c, s)]) || 0 })))
    const res = await run(() =>
      saveNewProduct({
        data: {
          name,
          brand,
          category,
          price: toAmount(price),
          cost: cost ? toAmount(cost) : null,
          lowStockAt: Number(lowAt) || 0,
          photo,
          variants,
        },
      }),
    )
    if (!res) return
    void refresh()
    router.navigate({ to: '/labels/$id', params: { id: String(res.id) }, search: { fresh: true }, replace: true })
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 140 }}>
      <TopBar title="New item" back="/stock" />

      <div className="row mt16" style={{ gap: 10 }}>
        <button type="button" className="photo" style={{ width: 96, height: 120, border: photo ? '1px solid var(--hair)' : '1px dashed var(--faint)', background: photo ? undefined : '#fff', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
          {photo ? <img src={photo} alt="" /> : <span className="small muted">+ Photo</span>}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
        <p className="small muted grow">Take a clear photo on a plain background. Staff see it after every scan.</p>
      </div>

      <div className="stack mt24" style={{ gap: 16 }}>
        <label className="field"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ribbed bodysuit" /></label>
        <div className="row" style={{ gap: 10 }}>
          <label className="field grow"><span className="label">Brand</span><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Zara" /></label>
          <label className="field grow"><span className="label">Category</span><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Tops" /></label>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label className="field grow"><span className="label">Selling price (RWF)</span><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="18000" /></label>
          <label className="field grow"><span className="label">Cost (RWF, admin only)</span><input className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" /></label>
        </div>
        <label className="field"><span className="label">Alert me when a size has this many or fewer</span><input className="input" inputMode="numeric" value={lowAt} onChange={(e) => setLowAt(e.target.value.replace(/\D/g, ''))} /></label>
      </div>

      <p className="section-label">Colours</p>
      <div className="chips">
        {colors.map((c) => (
          <button key={c} type="button" className="chip on" onClick={() => setColors(colors.filter((x) => x !== c))} title="Tap to remove">{c} ×</button>
        ))}
      </div>
      <form className="row mt8" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); addColor() }}>
        <input className="input" placeholder="Type a colour, e.g. White" value={colorDraft} onChange={(e) => setColorDraft(e.target.value)} />
        <button className="btn small" style={{ height: 50 }} disabled={!colorDraft.trim()}>Add</button>
      </form>

      <p className="section-label">Sizes</p>
      <div className="chips">
        {sizeOptions.map((s) => (
          <button key={s} type="button" className={`chip ${sizes.includes(s) ? 'on' : ''}`} onClick={() => toggle(sizes, s, setSizes)}>{s}</button>
        ))}
      </div>
      <form className="row mt8" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); addSize() }}>
        <input className="input" placeholder="Other size, e.g. 38 or One size" value={sizeDraft} onChange={(e) => setSizeDraft(e.target.value)} />
        <button className="btn small" style={{ height: 50 }} disabled={!sizeDraft.trim()}>Add</button>
      </form>

      {colors.length > 0 && orderedSizes.length > 0 && (
        <>
          <div className="row" style={{ marginTop: 28, marginBottom: 8 }}>
            <span className="label grow" style={{ margin: 0 }}>How many of each</span>
            <input className="input qty" style={{ width: 64 }} inputMode="numeric" placeholder="All" value={fillAll} onChange={(e) => setFillAll(e.target.value.replace(/\D/g, ''))} />
            <button type="button" className="btn small" onClick={() => {
              if (!fillAll) return
              const next: Record<string, string> = { ...qty }
              colors.forEach((c) => orderedSizes.forEach((s) => (next[key(c, s)] = fillAll)))
              setQty(next)
            }}>Fill</button>
          </div>
          <table className="table">
            <thead><tr><th /> {orderedSizes.map((s) => <th key={s}>{s}</th>)}</tr></thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  {orderedSizes.map((s) => (
                    <td key={s} style={{ padding: '5px 3px' }}>
                      <input className="input qty" inputMode="numeric" placeholder="0" value={qty[key(c, s)] ?? ''} onChange={(e) => setQty({ ...qty, [key(c, s)]: e.target.value.replace(/\D/g, '') })} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt16"><span className="grow">Total</span><strong>{total} pieces</strong></div>
        </>
      )}

      {error && <p className="error">{error}</p>}

      <div className="actions">
        <div>
          <button className="btn primary" disabled={busy || !name || !price || colors.length === 0 || orderedSizes.length === 0} onClick={save}>
            {busy ? 'Saving…' : 'Save & print labels'}
          </button>
        </div>
      </div>
    </div>
  )
}
