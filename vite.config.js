import { defineConfig } from 'vite'
import acde from '@dopame/acde-api/vite'

// acde() 插件：开发时把 acde:* 模块替换为 stub，打包时保留为系统模块。
export default defineConfig({
  plugins: [acde()],
  server: {
    proxy: {
      // 本地开发：把 /api/* 转发到本地后端适配器（node dev-backend.mjs）
      // 这样浏览器里也能完整跑 AI 复盘，无需 acdert 真机。
      '/api': 'http://localhost:8787',
    },
  },
})
