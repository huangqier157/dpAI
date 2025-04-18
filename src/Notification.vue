<template>
  <div v-if="visible" class="overlay">
    <div class="popup">
      <p>{{ message }}</p>
      <button @click="closePopup">取消</button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 控制弹框的显示和隐藏
const visible = ref(true)
// 弹框显示的消息
const message = ref('这是一条可以取消的通知')

// 关闭弹框
const closePopup = () => {
  visible.value = false
}
</script>

<style scoped>
/* 背景遮罩 */
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}

/* 弹框样式 */
.popup {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  text-align: center;
}

button {
  padding: 10px 20px;
  margin-top: 10px;
  background-color: #f44336;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #d32f2f;
}
</style>
