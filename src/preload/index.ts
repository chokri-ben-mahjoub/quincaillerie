import { contextBridge, ipcRenderer } from 'electron'
import type { ArticleInput, MovementInput, SaleInput, PurchaseInput, SupplierInput, ClientInput, UserInput } from '@shared/types'

// Pont sécurisé : seules ces fonctions sont exposées à l'interface (window.api).
const call = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api = {
  articles: {
    list: () => call('articles:list'),
    create: (a: ArticleInput) => call('articles:create', a),
    update: (id: number, a: ArticleInput) => call('articles:update', id, a),
    remove: (id: number) => call('articles:delete', id),
    importExcel: () => call('articles:import')
  },
  stock: {
    movements: (articleId?: number) => call('stock:movements', articleId),
    add: (m: MovementInput) => call('stock:add', m)
  },
  sales: {
    create: (s: SaleInput) => call('sales:create', s)
  },
  auth: {
    status: () => call('auth:status'),
    setup: (u: UserInput) => call('auth:setup', u),
    login: (username: string, password: string) => call('auth:login', username, password),
    logout: () => call('auth:logout')
  },
  backup: {
    list: () => call('backup:list'),
    config: () => call('backup:config'),
    setKeep: (n: number) => call('backup:setKeep', n),
    now: () => call('backup:now'),
    restore: (name: string) => call('backup:restore', name),
    chooseDir: () => call('backup:chooseDir')
  },
  users: {
    list: () => call('users:list'),
    create: (u: UserInput) => call('users:create', u),
    update: (id: number, u: UserInput) => call('users:update', id, u)
  },
  reports: {
    get: (from: string, to: string) => call('reports:get', from, to)
  },
  clients: {
    list: () => call('clients:list'),
    create: (c: ClientInput) => call('clients:create', c),
    update: (id: number, c: ClientInput) => call('clients:update', id, c),
    remove: (id: number) => call('clients:delete', id),
    pay: (id: number, amount: number, note: string) => call('clients:pay', id, amount, note)
  },
  suppliers: {
    list: () => call('suppliers:list'),
    create: (s: SupplierInput) => call('suppliers:create', s),
    update: (id: number, s: SupplierInput) => call('suppliers:update', id, s),
    remove: (id: number) => call('suppliers:delete', id),
    pay: (id: number, amount: number, note: string) => call('suppliers:pay', id, amount, note)
  },
  purchases: {
    list: () => call('purchases:list'),
    create: (p: PurchaseInput) => call('purchases:create', p)
  },
  categories: {
    list: () => call('categories:list'),
    create: (name: string) => call('categories:create', name)
  }
}

contextBridge.exposeInMainWorld('api', api)
