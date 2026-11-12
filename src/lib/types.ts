export type Role = 'admin' | 'sales'

export type SessionUser = {
  id: string
  name: string
  username: string
  role: Role
}

export type Payment = 'cash' | 'momo'
export type Channel = 'shop' | 'instagram'

export type CartItem = {
  variantId: number
  sku: string
  name: string
  color: string
  size: string
  price: number
  photo: string | null
}
