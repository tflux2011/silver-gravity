const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow;

function createWindow() {
  const isDev = !app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'SilverGravity UML',
  });

  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5180');
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built HTML
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open SilverGravity UML Project',
    filters: [
      { name: 'SilverGravity UML files', extensions: ['uml', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  const filePath = filePaths[0];
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { content, filePath };
  } catch (error) {
    console.error('Failed to read file:', error);
    throw error;
  }
});

ipcMain.handle('file:saveFile', async (event, { filePath, content }) => {
  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save file:', error);
    throw error;
  }
});

ipcMain.handle('dialog:saveFileAs', async (event, { content }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save SilverGravity UML Project As',
    filters: [
      { name: 'SilverGravity UML files', extensions: ['uml', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: 'diagram.uml'
  });

  if (canceled || !filePath) {
    return null;
  }

  try {
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true, filePath };
  } catch (error) {
    console.error('Failed to save file as:', error);
    throw error;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
