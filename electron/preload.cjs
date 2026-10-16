const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  isDesktop: true,
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  writeFile: (filePath, uint8Array) => ipcRenderer.invoke('fs:writeFile', filePath, uint8Array),
  showAbout: () => ipcRenderer.invoke('app:about'),
  getVersion: () => ipcRenderer.invoke('app:version')
});
