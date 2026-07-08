const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:saveFile', { filePath, content }),
  saveFileAs: (content) => ipcRenderer.invoke('dialog:saveFileAs', { content }),
});
