const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  verifyPin: (pin) => ipcRenderer.invoke('lock:verify', pin),
  getState: () => ipcRenderer.invoke('dev:state'),
  setPin: (pin, current) => ipcRenderer.invoke('dev:setPin', { pin, current }),
  removePin: (current) => ipcRenderer.invoke('dev:removePin', current),
  setStartup: (on) => ipcRenderer.invoke('dev:setStartup', on),
  lockNow: () => ipcRenderer.invoke('dev:lockNow')
});
