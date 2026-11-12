import { useRef, useState } from 'react'
import { createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import { updateProduct } from '~/server/app.functions'
import { productQuery, useFound, useRefresh } from '~/lib/queries'
import { toAmount } from '~/lib/format'
import { compressPhoto } from '~/lib/photo'
import { Photo, Switch, TopBar, useAction } from '~/components/ui'

export const Route = createFileRoute('/_app/admin/edit/$id')({
  loader: async ({ context, params }) => {
    if (!(await context.queryClient.ensureQueryData(productQuery(Number(params.id))))) throw notFound()
  },
  component: EditItem,
})

function EditItem() {
  const { id } = Route.useParams()
  const p = useFound(productQuery(Number(id))).product
  const router = useRouter()
  const refresh = useRefresh()
  const fileRef = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [name, setName] = useState(p.name)
  const [brand, setBrand] = useState(p.brand ?? '')
  const [category, setCategory] = useState(p.category ?? '')
  const [price, setPrice] = useState(String(p.price))
  const [cost, setCost] = useState(p.cost != null ? String(p.cost) : '')
  const [lowAt, setLowAt] = useState(String(p.lowStockAt))
  const [archived, setArchived] = useState(p.archived)
  const { busy, error, run } = useAction()

  async function save() {
    const ok = await run(() =>
      updateProduct({
        data: {
          id: p.id,
          name,
          brand,
          category,
          price: toAmount(price),
          cost: cost ? toAmount(cost) : null,
          lowStockAt: Number(lowAt) || 0,
          photo,
          archived,
        },
      }),
    )
    if (!ok) return
    await refresh(productQuery(p.id).queryKey)
    router.navigate({ to: '/stock/$id', params: { id: String(p.id) }, replace: true })
  }

  return (
    <div className="page no-tabs" style={{ paddingBottom: 140 }}>
      <TopBar title="Edit item" />
      <button type="button" className="linkbtn mt16" onClick={() => fileRef.current?.click()} style={{ textDecoration: 'none' }}>
        {photo ? <div className="photo" style={{ width: 96, height: 120 }}><img src={photo} alt="" /></div> : <Photo src={p.photo} className="thumb" />}
        <span className="small muted">Change photo</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPhoto(await compressPhoto(f)) }} />

      <div className="stack mt24" style={{ gap: 16 }}>
        <label className="field"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="row" style={{ gap: 10 }}>
          <label className="field grow"><span className="label">Brand</span><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
          <label className="field grow"><span className="label">Category</span><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></label>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <label className="field grow"><span className="label">Selling price (RWF)</span><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
          <label className="field grow"><span className="label">Cost (RWF)</span><input className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></label>
        </div>
        <label className="field"><span className="label">Low stock alert at</span><input className="input" inputMode="numeric" value={lowAt} onChange={(e) => setLowAt(e.target.value.replace(/\D/g, ''))} /></label>
        <div className="row">
          <div className="grow"><div>Hide this item</div><div className="tiny muted">For items you no longer sell. History is kept.</div></div>
          <Switch on={archived} onChange={setArchived} label="Hide item" />
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions"><div><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></div></div>
    </div>
  )
}
