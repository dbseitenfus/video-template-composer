import { createRouter, createWebHistory } from 'vue-router'
import { useProjectStore } from '../stores/project'
import { getToken } from '../admin/api'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/gravar/:slot', name: 'record', component: () => import('../views/RecordView.vue'), meta: { needsTemplate: true } },
    { path: '/revisar', name: 'review', component: () => import('../views/ReviewView.vue'), meta: { needsTemplate: true } },
    { path: '/exportar', name: 'export', component: () => import('../views/ExportView.vue'), meta: { needsTemplate: true, needsTakes: true } },
    { path: '/admin/entrar', name: 'admin-login', component: () => import('../admin/views/AdminLogin.vue'), meta: { admin: true } },
    { path: '/admin', name: 'admin-templates', component: () => import('../admin/views/AdminTemplates.vue'), meta: { admin: true } },
    { path: '/admin/templates/:id', name: 'admin-editor', component: () => import('../admin/views/AdminEditor.vue'), meta: { admin: true } },
    { path: '/admin/arquivos', name: 'admin-assets', component: () => import('../admin/views/AdminAssets.vue'), meta: { admin: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (to.meta.admin) {
    if (to.name !== 'admin-login' && !getToken()) return { name: 'admin-login', query: { next: to.fullPath } }
    return
  }
  const project = useProjectStore()
  if (to.meta.needsTemplate && !project.template) return { name: 'home' }
  if (to.name === 'record' && !project.template?.slots.some((s) => s.id === to.params.slot)) return { name: 'review' }
  if (to.meta.needsTakes && !project.allRecorded) return { name: 'review' }
})

declare module 'vue-router' {
  interface RouteMeta {
    needsTemplate?: boolean
    needsTakes?: boolean
    admin?: boolean
  }
}

export default router
