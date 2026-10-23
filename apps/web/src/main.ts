import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { reportError } from './lib/telemetry'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.config.errorHandler = (err) => reportError(err, { source: 'vue' })
window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'promise' }))
app.mount('#app')
