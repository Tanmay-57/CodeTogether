import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'landing', component: () => import('@/pages/LandingPage.vue') },
    { path: '/room/:roomId', name: 'room', component: () => import('@/pages/RoomPage.vue') },
  ],
})
