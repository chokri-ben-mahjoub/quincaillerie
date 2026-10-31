import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDatabase } from './db'
import { registerArticleHandlers } from './ipc/articles'
import { registerStockHandlers } from './ipc/stock'
import { registerSalesHandlers } from './ipc/sales'
import { registerPurchaseHandlers } from './ipc/purchases'
import { registerClientHandlers } from './ipc/clients'
import { registerReportHandlers } from './ipc/reports'
import { registerBackupHandlers, startBackupScheduler } from './ipc/backup'
import { registerInvoiceHandlers } from './ipc/invoices'
import { registerTicketHandlers } from './ipc/tickets'
import { registerSettingsHandlers } from './ipc/settings'
import { registerPrintHandlers } from './ipc/print'
import { registerShareHandlers } from './ipc/share'
import { registerDemoHandlers } from './ipc/demo'
import { installGuard, registerAuthHandlers } from './ipc/auth'
import { registerTraceHandlers } from './ipc/trace'
import { registerDashboardHandlers } from './ipc/dashboard'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'Quincaillerie',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // l'interface n'accède jamais à Node directement
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  initDatabase() // crée la base + applique le schéma au premier lancement
  installGuard() // doit précéder tous les enregistrements IPC
  registerAuthHandlers()
  registerBackupHandlers()
  registerInvoiceHandlers()
  registerTicketHandlers()
  registerSettingsHandlers()
  registerPrintHandlers()
  registerShareHandlers()
  registerDemoHandlers()
  startBackupScheduler()
  registerArticleHandlers()
  registerStockHandlers()
  registerSalesHandlers()
  registerPurchaseHandlers()
  registerClientHandlers()
  registerReportHandlers()
  registerTraceHandlers()
  registerDashboardHandlers()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
