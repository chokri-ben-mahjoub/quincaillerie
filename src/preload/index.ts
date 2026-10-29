import { contextBridge, ipcRenderer } from 'electron'
import type { InvoiceInput } from '@shared/invoice'
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
    create: (s: SaleInput) => call('sales:create', s),
    list: (scope: 'today' | 'week' | 'all', search: string) => call('sales:list', scope, search),
    get: (id: number) => call('sales:get', id),
    cancel: (id: number, reason: string) => call('sales:cancel', id, reason)
  },
  auth: {
    status: () => call('auth:status'),
    setup: (u: UserInput) => call('auth:setup', u),
    login: (username: string, password: string) => call('auth:login', username, password),
    logout: () => call('auth:logout')
  },
  invoices: {
    list: () => call('invoices:list'),
    get: (id: number) => call('invoices:get', id),
    save: (id: number | null, i: InvoiceInput) => call('invoices:save', id, i),
    validate: (id: number) => call('invoices:validate', id),
    remove: (id: number) => call('invoices:delete', id),
    preview: (id: number) => call('invoices:preview', id),
    exportPdf: (id: number) => call('invoices:export', id),
    print: (id: number) => call('invoices:print', id)
  },
  quotes: {
    list: () => call('quotes:list'),
    get: (id: number) => call('quotes:get', id),
    save: (id: number | null, i: InvoiceInput) => call('quotes:save', id, i),
    validate: (id: number) => call('quotes:validate', id),
    remove: (id: number) => call('quotes:delete', id),
    preview: (id: number) => call('quotes:preview', id),
    exportPdf: (id: number) => call('quotes:export', id),
    print: (id: number) => call('quotes:print', id),
    setStatus: (id: number, status: 'accepte' | 'refuse') => call('quotes:setStatus', id, status),
    convert: (id: number) => call('quotes:convert', id)
  },
  orders: {
    list: () => call('orders:list'),
    get: (id: number) => call('orders:get', id),
    save: (id: number | null, i: InvoiceInput) => call('orders:save', id, i),
    validate: (id: number) => call('orders:validate', id),
    remove: (id: number) => call('orders:delete', id),
    preview: (id: number) => call('orders:preview', id),
    exportPdf: (id: number) => call('orders:export', id),
    print: (id: number) => call('orders:print', id),
    setReceived: (id: number) => call('orders:setReceived', id)
  },
  deliveries: {
    list: () => call('deliveries:list'),
    get: (id: number) => call('deliveries:get', id),
    save: (id: number | null, i: InvoiceInput) => call('deliveries:save', id, i),
    validate: (id: number) => call('deliveries:validate', id),
    remove: (id: number) => call('deliveries:delete', id),
    preview: (id: number) => call('deliveries:preview', id),
    exportPdf: (id: number) => call('deliveries:export', id),
    print: (id: number) => call('deliveries:print', id),
    setDelivered: (id: number) => call('deliveries:setDelivered', id)
  },
  tickets: {
    print: (saleId: number, received?: number) => call('tickets:print', saleId, received),
    preview: (saleId: number, received?: number) => call('tickets:preview', saleId, received),
    exportPdf: (saleId: number, received?: number) => call('tickets:export', saleId, received)
  },
  company: {
    get: () => call('company:get')
  },
  print: {
    printers: () => call('print:printers'),
    test: (format: 'a4' | 'ticket') => call('print:test', format)
  },
  share: {
    compose: (kind: string, id: number) => call('share:compose', kind, id),
    open: (req: unknown) => call('share:open', req)
  },
  demo: {
    stats: () => call('demo:stats'),
    generate: (o: unknown) => call('demo:generate', o),
    reset: (o: unknown) => call('demo:reset', o)
  },
  app: {
    config: () => call('app:config')
  },
  settings: {
    getAll: () => call('settings:getAll'),
    set: (changes: Record<string, string>) => call('settings:set', changes)
  },
  backup: {
    list: () => call('backup:list'),
    config: () => call('backup:config'),
    now: () => call('backup:now'),
    restore: (name: string) => call('backup:restore', name),
    pickDir: () => call('backup:pickDir')
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
    pay: (id: number, amount: number, note: string) => call('clients:pay', id, amount, note),
    statement: (id: number) => call('clients:statement', id)
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
    create: (name: string) => call('categories:create', name),
    stats: () => call('categories:stats'),
    update: (id: number, name: string) => call('categories:update', id, name),
    remove: (id: number) => call('categories:delete', id)
  }
}

contextBridge.exposeInMainWorld('api', api)
