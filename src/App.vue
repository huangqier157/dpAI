<script setup lang="ts">
import {ref, reactive, onMounted, onBeforeUnmount, nextTick,} from 'vue'
import {fetchEventSource} from '@microsoft/fetch-event-source'
// 生成随机用户ID（示例：8位字母数字组合）
const generateUserId = () => {
  return Math.random().toString(36).substr(2, 8);
};

// 弹框显示控制变量
const showPopup = ref(true);

// 关闭弹框的方法
const closePopup = () => {
  showPopup.value = false;
};

// 生命周期，组件加载时展示弹框
onMounted(() => {
  // 如果用户之前已经关闭过弹框，则不再显示
  if (localStorage.getItem('popupClosed') === 'true') {
    showPopup.value = false;
  }
});
// 持久化存储用户ID
const userId = ref('');

enum MessageStatus {
  Streaming = 'streaming',
  Complete = 'complete',
  Error = 'error',
}

interface Message {
  id: string
  content: string
  isBot: boolean
  status?: MessageStatus
  timestamp: number
  retry?: () => Promise<void>
}

const messages = ref<Message[]>([])
const inputMessage = ref('')
const isLoading = ref(false)
const controller = ref<AbortController>()
const messageContainer = ref<HTMLElement>()
const inputRef = ref<HTMLInputElement>()

// 自动滚动控制
let autoScroll = true
// @ts-ignore
let lastCharType: 'chinese' | 'english' | 'other' = 'other'

const scrollToBottom = () => {
  nextTick(() => {
    if (messageContainer.value && autoScroll) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
}

const handleScroll = () => {
  if (!messageContainer.value) return
  const {scrollTop, scrollHeight, clientHeight} = messageContainer.value
  autoScroll = scrollHeight - (scrollTop + clientHeight) < 50
}

// 字符类型检测
const getCharType = (char: string): 'chinese' | 'english' | 'other' => {
  if (/[\u4e00-\u9fa5\u3000-\u303F\uFF00-\uFFEF]/.test(char)) {
    return 'chinese'
  }
  if (/[a-zA-Z]/.test(char)) {
    return 'english'
  }
  return 'other'
}

// 智能空格处理核心逻辑
const processContent = (prev: string, newData: string): string => {
  if (prev.length === 0) return newData

  const lastChar = prev.slice(-1)
  const newFirstChar = newData[0] || ''

  const prevType = getCharType(lastChar)
  const newType = getCharType(newFirstChar)

  let processed = newData

  // 需要添加空格的情况
  const shouldAddSpace =
      (prevType === 'english' && newType === 'english') || // 英文接英文
      (prevType === 'chinese' && newType === 'english') || // 中文接英文
      (prevType === 'english' && newType === 'chinese' && !/[!?,.]$/.test(lastChar)) // 英文接中文（非标点结尾）

  // 需要删除空格的情况
  const shouldRemoveSpace =
      (prevType === 'chinese' && newType === 'chinese') || // 中文接中文
      (prevType === 'other' && /^[\u4e00-\u9fa5]/.test(newData)) // 特殊符号接中文

  if (shouldAddSpace && !lastChar.match(/\s/) && !newFirstChar.match(/\s/)) {
    processed = ' ' + processed
  } else if (shouldRemoveSpace) {
    processed = processed.replace(/^\s+/, '')
  }

  return processed
}

const sendChatRequest = async (content: string, botMessage: Message) => {
  controller.value = new AbortController()

// const apiUrl = import.meta.env.VITE_API_BASE_URL;

// await fetchEventSource(`${apiUrl}/chat/stream`, {
    await fetchEventSource('http://113.46.139.231:8089/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'X-Content-Lang': 'zh-CN'
    },
    body: JSON.stringify({message: content,userId:userId.value}),
    signal: controller.value?.signal,
    openWhenHidden: true,

    onopen: async response => {
      if (!response.ok) throw new Error(`HTTP error ${response.status}`)
    },

    onmessage: event => {
      if (event.data === '[DONE]') {
        botMessage.status = MessageStatus.Complete
        return
      }

      const processedData = processContent(botMessage.content, event.data)
      botMessage.content += processedData
      botMessage.timestamp = Date.now()

      // 更新最后字符类型
      const lastChar = processedData.slice(-1)
      lastCharType = getCharType(lastChar)

      scrollToBottom()
    },

    onerror: err => {
      throw err
    }
  })
}

// 错误处理
const handleRequestError = (botMessage: Message, error: unknown) => {
  const errorMessage = error instanceof Error
      ? navigator.onLine
          ? error.message
          : '网络连接不可用'
      : '请求发生未知错误'

  botMessage.status = MessageStatus.Error
  botMessage.content = errorMessage
  // botMessage.retry = createRetryHandler(botMessage.content)
}

// 主发送逻辑
const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userContent = inputMessage.value.trim()
  inputMessage.value = ''

  // 创建用户消息
  const userMessage = reactive<Message>({
    id: `user-${Date.now()}`,
    content: userContent,
    isBot: false,
    timestamp: Date.now()
  })
  messages.value.push(userMessage)

  // 创建机器人消息
  const botMessage = reactive<Message>({
    id: `bot-${Date.now()}`,
    content: '',
    isBot: true,
    status: MessageStatus.Streaming,
    timestamp: Date.now()
  })
  messages.value.push(botMessage)

  isLoading.value = true

  try {
    await sendChatRequest(userContent, botMessage)
  } catch (err) {
    handleRequestError(botMessage, err)
  } finally {
    isLoading.value = false
    nextTick(() => inputRef.value?.focus())
  }
}

// 停止生成
const stopGeneration = () => {
  controller.value?.abort()
  isLoading.value = false
}

// 生命周期
onMounted(() => {
  userId.value = localStorage.getItem('chatUserId') || generateUserId();
  localStorage.setItem('chatUserId', userId.value);
  messageContainer.value?.addEventListener('scroll', handleScroll)
  inputRef.value?.focus()
})

onBeforeUnmount(() => {
  messageContainer.value?.removeEventListener('scroll', handleScroll)
  controller.value?.abort()
})
</script>

<template>
  <div class="chat-container">
        <div v-if="showPopup" class="popup-overlay">
      <div class="popup-content">
        <p>欢迎来到我的页面！</p>
                <p class="smiley-icon">❀😊❀</p>

        <button class="close-btn" @click="closePopup">X</button>
      </div>
    </div>

    <header class="app-header">
      <div class="logo">
        <svg viewBox="0 0 24 24">
          <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
        <h1>Spring AI 智能机器人</h1>
      </div>
    </header>

    <div class="messages" ref="messageContainer">
      <div
          v-for="msg in messages"
          :key="msg.id"
          :class="[
          'message',
          msg.isBot ? 'bot' : 'user',
          { streaming: msg.status === MessageStatus.Streaming }
        ]"
      >
        <div class="avatar">
          <svg v-if="msg.isBot" viewBox="0 0 24 24">
            <path
                d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24">
            <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        </div>

        <div class="message-content">
          <div class="meta">
            <span class="sender">{{ msg.isBot ? 'Spring AI DeepSeek' : '我' }}</span>
            <span class="time">{{ new Date(msg.timestamp).toLocaleTimeString() }}</span>
          </div>
          <div class="bubble">
            <template v-if="msg.status === MessageStatus.Streaming">
              <div class="typing-indicator">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </template>
            <div class="text-content">{{ msg.content }}</div>
            <div v-if="msg.status === MessageStatus.Error" class="error-actions">
              <button @click="msg.retry?.()">重试</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="input-area">
      <div class="input-wrapper">
        <input
            ref="inputRef"
            v-model="inputMessage"
            @keyup.enter="sendMessage"
            placeholder="输入消息..."
            :disabled="isLoading"
        />
        <button
            @click="sendMessage"
            :disabled="isLoading"
            class="send-button"
        >
          <span v-if="isLoading">发送中...</span>
          <span v-else>发送</span>
        </button>
        <button
            v-if="isLoading"
            @click="stopGeneration"
            class="stop-button"
        >
          停止
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 弹框样式 - 美化版 */
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  backdrop-filter: blur(5px);
  animation: fadeIn 0.3s ease;
}

.popup-content {
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 30px;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  text-align: center;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 250px;
  width: 350px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  transform: scale(0.95);
  animation: popIn 0.3s ease forwards;
}

.popup-content p {
  font-size: 18px;
  color: #333;
  margin-bottom: 10px;
  font-weight: 500;
}

.smiley-icon {
  font-size: 24px;
  margin: 15px 0;
  color: #3b82f6;
  animation: bounce 2s infinite;
}

.close-btn {
  margin-top: auto;
  background: linear-gradient(to right, #3b82f6, #6366f1);
  border: none;
  font-size: 16px;
  padding: 12px 24px;
  cursor: pointer;
  color: white;
  border-radius: 30px;
  width: 140px;
  align-self: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.close-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
  background: linear-gradient(to right, #6366f1, #3b82f6);
}

.close-btn:active {
  transform: translateY(0);
}

/* 新增动画 */
@keyframes popIn {
  0% {
    transform: scale(0.95);
    opacity: 0;
  }
  50% {
    transform: scale(1.03);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

.close-btn:hover {
  background-color: #4bd5ff; /* 按钮的悬停效果 */
}
/* 聊天样式 */
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  max-width: 800px;
  margin: 0 auto;
  background: #f8fafc;
}

.app-header {
  padding: 1rem;
  background: #3b82f6;
  color: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.logo {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem;
}

.logo svg {
  width: 32px;
  height: 32px;
  fill: currentColor;
}

.logo h1 {
  font-size: 1.25rem;
  margin: 0;
  font-weight: 600;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  background: linear-gradient(to bottom, #ffffff, #f8fafc);
}

.message {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  opacity: 0;
  animation: fadeIn 0.3s ease forwards;
}

@keyframes fadeIn {
  to {
    opacity: 1;
  }
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.message.user .avatar {
  background: #bfdbfe;
}

.message-content {
  max-width: 70%;
  min-width: 200px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #64748b;
}

.bubble {
  padding: 1rem;
  border-radius: 1rem;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  line-height: 1.6;
  position: relative;
}

.message.user .bubble {
  background: #3b82f6;
  color: white;
  border-radius: 1rem 1rem 0 1rem;
}

.text-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.typing-indicator {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.dot {
  width: 8px;
  height: 8px;
  background: #64748b;
  border-radius: 50%;
  animation: bounce 1.4s infinite;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-6px);
  }
}

.input-area {
  padding: 1rem;
  background: white;
  border-top: 1px solid #e2e8f0;
}

.input-wrapper {
  display: flex;
  gap: 0.5rem;
  max-width: 100%;
}

input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  font-size: 1rem;
  transition: all 0.2s;
}

input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

button {
  padding: 0.75rem 1.25rem;
  border: none;
  border-radius: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.send-button {
  background: #3b82f6;
  color: white;
}

.send-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.stop-button {
  background: #ef4444;
  color: white;
}

.error-actions {
  margin-top: 0.5rem;
}

.error-actions button {
  padding: 0.5rem 1rem;
  background: #f8d7da;
  color: #721c24;
  font-size: 0.875rem;
}

@media (max-width: 768px) {
  .chat-container {
    max-width: 100%;
  }

  .message-content {
    max-width: 85%;
  }

  .input-wrapper {
    flex-direction: column;
  }

  button {
    width: 100%;
  }
}
</style>