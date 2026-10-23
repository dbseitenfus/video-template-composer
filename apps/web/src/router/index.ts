import { createRouter, createWebHistory } from 'vue-router'
import { useProjectStore } from '../stores/project'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue') },
    { path: '/gravar/:slot', name: 'record', component: () => import('../views/RecordView.vue'), meta: { needsTemplate: true } },
    { path: '/revisar', name: 'review', component: () => import('../views/ReviewView.vue'), meta: { needsTemplate: true } },
    { path: '/exportar', name: 'export', component: () => import('../views/ExportView.vue'), meta: { needsTemplate: true, needsTakes: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const project = useProjectStore()
  if (to.meta.needsTemplate && !project.template) return { name: 'home' }
  if (to.name === 'record' && !project.template?.slots.some((s) => s.id === to.params.slot)) return { name: 'review' }
  if (to.meta.needsTakes && !project.allRecorded) return { name: 'review' }
})

declare module 'vue-router' {
  interface RouteMeta {
    needsTemplate?: boolean
    needsTakes?: boolean
  }
}

export default router
