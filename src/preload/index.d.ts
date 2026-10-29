import type { BackupConfig, BackupInfo, AuthStatus, User, UserInput, ReportData, Client, ClientInput, Article, ArticleInput, Category, ImportReport, MovementInput, Purchase, PurchaseInput, Receipt, Result, Supplier, SupplierInput, SaleInput, StockMovement } from '@shared/types'

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
      }
      auth: {
        status: () => Promise<Result<AuthStatus>>
        setup: (u: UserInput) => Promise<Result<User>>
        login: (username: string, password: string) => Promise<Result<User>>
        logout: () => Promise<Result<void>>
      }
      backup: {
        list: () => Promise<Result<BackupInfo[]>>
        config: () => Promise<Result<BackupConfig>>
        setKeep: (n: number) => Promise<Result<void>>
        now: () => Promise<Result<string>>
        restore: (name: string) => Promise<Result<void>>
        chooseDir: () => Promise<Result<string | null>>
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
      }
    }
  }
}
export {}
