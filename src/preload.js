const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // config
  configGet: (key) => ipcRenderer.invoke('config:get', key),
  configSet: (key, value) => ipcRenderer.invoke('config:set', key, value),
  configAll: () => ipcRenderer.invoke('config:all'),
  onConfigInit: (cb) => {
    ipcRenderer.on('config:init', cb)
    return () => ipcRenderer.removeListener('config:init', cb)
  },

  // pet window
  petHover: (hit) => ipcRenderer.send('pet:hover', hit),
  petDragStart: () => ipcRenderer.send('pet:drag-start'),
  petDragEnd: () => ipcRenderer.send('pet:drag-end'),
  petOpenPanel: () => ipcRenderer.send('pet:open-panel'),
  petSnapBottom: () => ipcRenderer.send('pet:snap-bottom'),
  petSavePos: (x, y) => ipcRenderer.send('pet:save-pos', { x, y }),
  petBubble: (text) => ipcRenderer.send('pet:bubble', text),
  petState: (state) => ipcRenderer.send('pet:state', state),

  onPetDrag: (cb) => { ipcRenderer.on('pet:drag', cb); return () => ipcRenderer.removeListener('pet:drag', cb) },
  onPetDropped: (cb) => { ipcRenderer.on('pet:dropped', cb); return () => ipcRenderer.removeListener('pet:dropped', cb) },
  onPetSnap: (cb) => { ipcRenderer.on('pet:snap', cb); return () => ipcRenderer.removeListener('pet:snap', cb) },
  onPetBubble: (cb) => { ipcRenderer.on('pet:bubble', cb); return () => ipcRenderer.removeListener('pet:bubble', cb) },
  onPetState: (cb) => { ipcRenderer.on('pet:state', cb); return () => ipcRenderer.removeListener('pet:state', cb) },

  // timer -> pet
  onPetPomoTick: (cb) => { ipcRenderer.on('pet:pomo-tick', cb); return () => ipcRenderer.removeListener('pet:pomo-tick', cb) },
  onPetPomoDone: (cb) => { ipcRenderer.on('pet:pomo-done', cb); return () => ipcRenderer.removeListener('pet:pomo-done', cb) },
  onPetGripTick: (cb) => { ipcRenderer.on('pet:grip-tick', cb); return () => ipcRenderer.removeListener('pet:grip-tick', cb) },
  onPetGripPhase: (cb) => { ipcRenderer.on('pet:grip-phase', cb); return () => ipcRenderer.removeListener('pet:grip-phase', cb) },
  onPetGripDone: (cb) => { ipcRenderer.on('pet:grip-done', cb); return () => ipcRenderer.removeListener('pet:grip-done', cb) },
  onPetReminder: (cb) => { ipcRenderer.on('pet:reminder', cb); return () => ipcRenderer.removeListener('pet:reminder', cb) },

  // timer -> panel
  timerStartPomo: (opts) => ipcRenderer.send('timer:start-pomo', opts),
  timerPausePomo: () => ipcRenderer.send('timer:pause-pomo'),
  timerResumePomo: () => ipcRenderer.send('timer:resume-pomo'),
  timerStopPomo: () => ipcRenderer.send('timer:stop-pomo'),
  timerPomoState: () => ipcRenderer.invoke('timer:pomo-state'),

  timerStartGrip: (opts) => ipcRenderer.invoke('timer:start-grip', opts),
  gripSchedule: () => ipcRenderer.invoke('grip:schedule'),
  timerPauseGrip: () => ipcRenderer.send('timer:pause-grip'),
  timerResumeGrip: () => ipcRenderer.send('timer:resume-grip'),
  timerStopGrip: () => ipcRenderer.send('timer:stop-grip'),
  timerGripState: () => ipcRenderer.invoke('timer:grip-state'),

  timerSetReminders: (list) => ipcRenderer.send('timer:set-reminders', list),
  timerGetReminders: () => ipcRenderer.invoke('timer:get-reminders'),

  onTimerTick: (cb) => { ipcRenderer.on('timer:tick', cb); return () => ipcRenderer.removeListener('timer:tick', cb) },
  onTimerPomoDone: (cb) => { ipcRenderer.on('timer:pomo-done', cb); return () => ipcRenderer.removeListener('timer:pomo-done', cb) },
  onTimerGripPhase: (cb) => { ipcRenderer.on('timer:grip-phase', cb); return () => ipcRenderer.removeListener('timer:grip-phase', cb) },
  onTimerGripDone: (cb) => { ipcRenderer.on('timer:grip-done', cb); return () => ipcRenderer.removeListener('timer:grip-done', cb) },

  // llm
  llmChat: (messages) => ipcRenderer.invoke('llm:chat', { messages }),

  // grip logs
  gripLog: (log) => ipcRenderer.send('grip:log', log),
  gripLogs: () => ipcRenderer.invoke('grip:logs'),

  // stats
  statsBump: (key, amount = 1) => ipcRenderer.send('stats:bump', key, amount),
  statsGet: () => ipcRenderer.invoke('stats:get'),
})
