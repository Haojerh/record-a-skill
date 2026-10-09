const { contextBridge, ipcRenderer } = require('electron');
const methods = ['check', 'settings', 'shortcutCapture', 'provider', 'toolLogin', 'toolAccount', 'toolLogout', 'toolInstall', 'toolDocs', 'saveProvider', 'removeProvider', 'refreshModels', 'setup', 'login', 'account', 'model', 'logout', 'acknowledge', 'manageUsage', 'sources', 'importVideo', 'begin', 'append', 'finish', 'status', 'command', 'retry', 'cancel', 'save', 'openFolder'];
const api = Object.fromEntries(methods.map(name => [name, (...args) => ipcRenderer.invoke(`recorder:${name}`, ...args)]));
api.subscribe = callback => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on('recorder:event', listener);
  return () => ipcRenderer.removeListener('recorder:event', listener);
};
contextBridge.exposeInMainWorld('recorder', api);
