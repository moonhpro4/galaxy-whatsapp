const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const WA_URL = 'https://web.whatsapp.com';
const ICON = path.join(__dirname, 'build', 'icon.png');
// WhatsApp Web refuses to load for "Electron" user agents, so present as plain Chrome.
const UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

let mainWindow = null, lockWindow = null, devWindow = null;
let unlocked = false;

/* ---------- config / PIN storage ---------- */
const configPath = () => path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(cfg) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg));
}
function hashPin(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}
function setPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  writeConfig({ ...readConfig(), salt, hash: hashPin(pin, salt) });
}
function removePin() {
  const { salt, hash, ...rest } = readConfig();
  writeConfig(rest);
}
function hasPin() { const c = readConfig(); return !!(c.salt && c.hash); }
function checkPin(pin) {
  const c = readConfig();
  if (!c.salt || !c.hash || typeof pin !== 'string') return false;
  const a = Buffer.from(hashPin(pin, c.salt), 'hex');
  const b = Buffer.from(c.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const validPin = (p) => typeof p === 'string' && /^\d{4,12}$/.test(p);

/* ---------- brute-force throttle ---------- */
let fails = 0, lockedUntil = 0;
function attemptPin(pin) {
  const now = Date.now();
  if (now < lockedUntil) return { ok: false, wait: Math.ceil((lockedUntil - now) / 1000) };
  if (checkPin(pin)) { fails = 0; return { ok: true }; }
  fails++;
  if (fails >= 5) { lockedUntil = now + 30000; fails = 0; return { ok: false, wait: 30 }; }
  return { ok: false, left: 5 - fails };
}

/* ---------- windows ---------- */
function secureWebPrefs() {
  return { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true };
}

function createLockWindow() {
  lockWindow = new BrowserWindow({
    width: 380, height: 520, resizable: false, maximizable: false, title: 'WhatsApp',
    icon: ICON, autoHideMenuBar: true, backgroundColor: '#0b0818', webPreferences: secureWebPrefs()
  });
  lockWindow.loadFile(path.join(__dirname, 'ui', 'lock.html'));
  lockWindow.on('closed', () => { lockWindow = null; if (!unlocked) app.quit(); });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 700, minHeight: 500, title: 'WhatsApp',
    icon: ICON, autoHideMenuBar: true, backgroundColor: '#111b21',
    webPreferences: { partition: 'persist:whatsapp', contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const wc = mainWindow.webContents;
  wc.setUserAgent(UA);
  mainWindow.loadURL(WA_URL, { userAgent: UA });

  // Open every external link in the default browser, keep WhatsApp inside the app.
  wc.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith(WA_URL)) { e.preventDefault(); shell.openExternal(url); }
  });

  // Secret shortcut: Ctrl + Alt + F3
  wc.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.control && input.alt && input.key === 'F3') {
      event.preventDefault();
      openDevWindow();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; if (devWindow) devWindow.close(); if (unlocked) app.quit(); });
}

function openDevWindow() {
  if (!unlocked) return;
  if (devWindow) { devWindow.focus(); return; }
  devWindow = new BrowserWindow({
    width: 460, height: 640, title: 'Developer Mode', icon: ICON, autoHideMenuBar: true,
    parent: mainWindow, backgroundColor: '#0b0818', webPreferences: secureWebPrefs()
  });
  devWindow.loadFile(path.join(__dirname, 'ui', 'dev.html'));
  devWindow.on('closed', () => { devWindow = null; });
}

function startApp() {
  if (hasPin()) { unlocked = false; createLockWindow(); }
  else { unlocked = true; createMainWindow(); }
}

/* ---------- IPC ---------- */
ipcMain.handle('lock:verify', (e, pin) => {
  if (!lockWindow || e.sender !== lockWindow.webContents) return { ok: false };
  const r = attemptPin(pin);
  if (r.ok) {
    unlocked = true;
    createMainWindow();
    const lw = lockWindow; lockWindow = null; lw.destroy();
  }
  return r;
});

const fromDev = (e) => unlocked && devWindow && e.sender === devWindow.webContents;

ipcMain.handle('dev:state', (e) => {
  if (!fromDev(e)) return null;
  return { hasPin: hasPin(), startup: app.getLoginItemSettings().openAtLogin, version: app.getVersion() };
});
ipcMain.handle('dev:setPin', (e, { pin, current }) => {
  if (!fromDev(e)) return { ok: false, error: 'Not allowed' };
  if (!validPin(pin)) return { ok: false, error: 'PIN must be 4–12 digits' };
  if (hasPin()) { const r = attemptPin(current); if (!r.ok) return { ok: false, error: r.wait ? `Too many attempts, wait ${r.wait}s` : 'Current PIN is wrong' }; }
  setPin(pin);
  return { ok: true };
});
ipcMain.handle('dev:removePin', (e, current) => {
  if (!fromDev(e)) return { ok: false, error: 'Not allowed' };
  const r = attemptPin(current);
  if (!r.ok) return { ok: false, error: r.wait ? `Too many attempts, wait ${r.wait}s` : 'PIN is wrong' };
  removePin();
  return { ok: true };
});
ipcMain.handle('dev:setStartup', (e, enabled) => {
  if (!fromDev(e)) return false;
  app.setLoginItemSettings({ openAtLogin: !!enabled });
  return app.getLoginItemSettings().openAtLogin;
});
ipcMain.handle('dev:lockNow', (e) => {
  if (!fromDev(e)) return false;
  if (!hasPin()) return false;
  unlocked = false;
  if (devWindow) devWindow.destroy();
  if (mainWindow) { const m = mainWindow; mainWindow = null; m.destroy(); }
  createLockWindow();
  return true;
});

/* ---------- lifecycle ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = mainWindow || lockWindow;
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(() => { Menu.setApplicationMenu(null); startApp(); });
  app.on('window-all-closed', () => app.quit());
}
