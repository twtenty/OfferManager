const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('offerManager', {
  getSnapshot: () => ipcRenderer.invoke('data:snapshot'),
  saveApplication: input => ipcRenderer.invoke('application:save', input),
  updateApplicationStatus: input => ipcRenderer.invoke('application:status', input),
  deleteApplication: id => ipcRenderer.invoke('application:delete', id),
  saveEvent: input => ipcRenderer.invoke('event:save', input),
  deleteEvent: id => ipcRenderer.invoke('event:delete', id),
  createReview: input => ipcRenderer.invoke('review:create', input),
  linkReview: input => ipcRenderer.invoke('review:link', input),
  readReview: id => ipcRenderer.invoke('review:read', id),
  saveReview: input => ipcRenderer.invoke('review:save', input),
  openReviewExternal: id => ipcRenderer.invoke('review:openExternal', id),
  deleteReview: id => ipcRenderer.invoke('review:delete', id),
  openUrl: url => ipcRenderer.invoke('system:openUrl', url),
  showDataFolder: () => ipcRenderer.invoke('system:showData'),
  exportCsv: () => ipcRenderer.invoke('data:exportCsv'),
})
