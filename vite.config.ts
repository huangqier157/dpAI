import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base:'./',
  plugins: [vue()],
  build:{
    target:"es2015"
  },
  server: {
    port: 3000, // 设置开发服务器端口
    open: true, // 自动打开浏览器
  }
  // define: {
  //   __API_BASE_URL__: JSON.stringify('http://113.46.139.231:8089')  // 将后端地址定义为一个常量
  // }
})
