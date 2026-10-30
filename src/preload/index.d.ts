import type { ShareDraft, ShareRequest } from '@shared/share'
import type { DemoOptions, DemoReport, DemoStats, ResetOptions } from '@shared/demo'
import type { AppConfig, SettingsMap } from '@shared/settings'
import type { CompanyInfo, Invoice, InvoiceInput, InvoicePayment, InvoicePaymentInput, InvoiceSummary, Delivery, DeliverySummary, Order, OrderSummary, Quote, QuoteSummary } from '@shared/invoice'
import type { ClientStatement, SaleDetail, SaleSummary, BackupConfig, BackupInfo, AuthStatus, User, UserInput, ReportData, Client, ClientInput, Article, ArticleInput, Category, ImportReport, MovementInput, Purchase, PurchaseInput, Receipt, Result, Supplier, SupplierInput, SaleInput, StockMovement } from '@shared/types'

// Typage de window.api côté interface.
declare global {
  interface Window {
    api: {
      articles: {
        list: () => Promise<Result<Article[]>>
        create: (a: ArticleInput) => Promise<Result<Article>>
        update: (id: number, a: ArticleInput) => Promise<Result<Article>>
        remove: (id: number) => Promise<Result<void>>
        importExcel: () => Promise<Result<ImportReport | null>>
      }
      stock: {
        movements: (articleId?: number) => Promise<Result<StockMovement[]>>
        add: (m: MovementInput) => Promise<Result<void>>
      }
      sales: {
        create: (s: SaleInput) => Promise<Result<Receipt>>
        list: (scope: 'today' | 'week' | 'all', search: string) => Promise<Result<SaleSummary[]>>
        get: (id: number) => Promise<Result<SaleDetail>>
        cancel: (id: number, reason: string) => Promise<Result<void>>
      }
      auth: {
        status: () => Promise<Result<AuthStatus>>
        setup: (u: UserInput) => Promise<Result<User>>
        login: (username: string, password: string) => Promise<Result<User>>
        logout: () => Promise<Result<void>>
      }
      invoices: {
        list: () => Promise<Result<InvoiceSummary[]>>
        get: (id: number) => Promise<Result<Invoice>>
        save: (id: number | null, i: InvoiceInput) => Promise<Result<number>>
        validate: (id: number) => Promise<Result<string>>
        remove: (id: number) => Promise<Result<void>>
        preview: (id: number) => Promise<Result<void>>
        exportPdf: (id: number) => Promise<Result<string | null>>
        print: (id: number) => Promise<Result<boolean>>
        payments: (id: number) => Promise<Result<InvoicePayment[]>>
        pay: (id: number, p: InvoicePaymentInput) => Promise<Result<void>>
        unpay: (paymentId: number) => Promise<Result<void>>
      }
      quotes: {
        list: () => Promise<Result<QuoteSummary[]>>
        get: (id: number) => Promise<Result<Quote>>
        save: (id: number | null, i: InvoiceInput) => Promise<Result<number>>
        validate: (id: number) => Promise<Result<string>>
        remove: (id: number) => Promise<Result<void>>
        preview: (id: number) => Promise<Result<void>>
        exportPdf: (id: number) => Promise<Result<string | null>>
        print: (id: number) => Promise<Result<boolean>>
        setStatus: (id: number, status: 'accepte' | 'refuse') => Promise<Result<void>>
        convert: (id: number) => Promise<Result<number>>
      }
      orders: {
        list: () => Promise<Result<OrderSummary[]>>
        get: (id: number) => Promise<Result<Order>>
        save: (id: number | null, i: InvoiceInput) => Promise<Result<number>>
        validate: (id: number) => Promise<Result<string>>
        remove: (id: number) => Promise<Result<void>>
        preview: (id: number) => Promise<Result<void>>
        exportPdf: (id: number) => Promise<Result<string | null>>
        print: (id: number) => Promise<Result<boolean>>
        setReceived: (id: number) => Promise<Result<void>>
      }
      deliveries: {
        list: () => Promise<Result<DeliverySummary[]>>
        get: (id: number) => Promise<Result<Delivery>>
        save: (id: number | null, i: InvoiceInput) => Promise<Result<number>>
        validate: (id: number) => Promise<Result<string>>
        remove: (id: number) => Promise<Result<void>>
        preview: (id: number) => Promise<Result<void>>
        exportPdf: (id: number) => Promise<Result<string | null>>
        print: (id: number) => Promise<Result<boolean>>
        setDelivered: (id: number) => Promise<Result<void>>
      }
      tickets: {
        print: (saleId: number, received?: number) => Promise<Result<boolean>>
        preview: (saleId: number, received?: number) => Promise<Result<void>>
        exportPdf: (saleId: number, received?: number) => Promise<Result<string | null>>
      }
      company: {
        get: () => Promise<Result<CompanyInfo>>
      }
      print: {
        printers: () => Promise<Result<{ name: string; isDefault: boolean }[]>>
        test: (format: 'a4' | 'ticket') => Promise<Result<boolean>>
      }
      share: {
        compose: (kind: string, id: number) => Promise<Result<ShareDraft>>
        open: (req: ShareRequest) => Promise<Result<{ url: string; pdfPath: string }>>
      }
      demo: {
        stats: () => Promise<Result<DemoStats>>
        generate: (o: DemoOptions) => Promise<Result<DemoReport>>
        reset: (o: ResetOptions) => Promise<Result<{ backup: string }>>
      }
      app: {
        config: () => Promise<Result<AppConfig>>
      }
      settings: {
        getAll: () => Promise<Result<SettingsMap>>
        set: (changes: Record<string, string>) => Promise<Result<SettingsMap>>
      }
      backup: {
        list: () => Promise<Result<BackupInfo[]>>
        config: () => Promise<Result<BackupConfig>>
        now: () => Promise<Result<string>>
        restore: (name: string) => Promise<Result<void>>
        pickDir: () => Promise<Result<string | null>>
      }
      users: {
        list: () => Promise<Result<User[]>>
        create: (u: UserInput) => Promise<Result<void>>
        update: (id: number, u: UserInput) => Promise<Result<void>>
      }
      reports: {
        get: (from: string, to: string) => Promise<Result<ReportData>>
      }
      clients: {
        list: () => Promise<Result<Client[]>>
        create: (c: ClientInput) => Promise<Result<void>>
        update: (id: number, c: ClientInput) => Promise<Result<void>>
        remove: (id: number) => Promise<Result<void>>
        pay: (id: number, amount: number, note: string) => Promise<Result<void>>
        statement: (id: number) => Promise<Result<ClientStatement>>
      }
      suppliers: {
        list: () => Promise<Result<Supplier[]>>
        create: (s: SupplierInput) => Promise<Result<void>>
        update: (id: number, s: SupplierInput) => Promise<Result<void>>
        remove: (id: number) => Promise<Result<void>>
        pay: (id: number, amount: number, note: string) => Promise<Result<void>>
      }
      purchases: {
        list: () => Promise<Result<Purchase[]>>
        create: (p: PurchaseInput) => Promise<Result<number>>
      }
      categories: {
        list: () => Promise<Result<Category[]>>
        create: (name: string) => Promise<Result<Category>>
        stats: () => Promise<Result<{ id: number; name: string; count: number }[]>>
        update: (id: number, name: string) => Promise<Result<void>>
        remove: (id: number) => Promise<Result<void>>
      }
    }
  }
}
export {}
