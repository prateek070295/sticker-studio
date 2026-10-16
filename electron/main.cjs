const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 750,
    title: 'Sticker Studio — Sheet Extractor',
    icon: path.join(__dirname, '../build/icon.ico'),
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  // Security: Deny arbitrary new window creation and external navigation
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!navigationUrl.startsWith('file://')) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Application Menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Sticker Sheet...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await handleFileOpen();
            if (result && mainWindow) {
              mainWindow.webContents.send('menu:open-file', result);
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Sticker Studio',
          click: showAboutDialog
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function handleFileOpen() {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Sticker Sheet',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (canceled || filePaths.length === 0) return null;

  const selectedPath = filePaths[0];
  const fileBuffer = fs.readFileSync(selectedPath);
  const ext = path.extname(selectedPath).toLowerCase().replace('.', '');
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;

  return {
    filePath: selectedPath,
    fileName: path.basename(selectedPath),
    dataUrl
  };
}

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Sticker Studio',
    message: 'Sticker Studio — Sheet Extractor',
    detail: `Version 1.0.0 (x64 Windows)\n\nLocal-first illustration extractor and print-ready transparent PNG die-cut generator.\n\nRunning fully offline on your device with Zero Cloud Dependencies.\n© 2026 Sticker Studio`,
    buttons: ['OK']
  });
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  return await handleFileOpen();
});

ipcMain.handle('dialog:saveFile', async (event, options) => {
  if (!mainWindow) return null;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: options?.title || 'Save Sticker Export',
    defaultPath: options?.defaultPath || 'sticker.png',
    filters: options?.filters || [{ name: 'Images', extensions: ['png'] }]
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, Buffer.from(data));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('app:about', () => {
  showAboutDialog();
});

ipcMain.handle('app:version', () => {
  return app.getVersion();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
