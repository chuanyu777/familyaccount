import { ref } from 'vue';

// 极简全局 Toast：showToast('已记一笔')，1.6s 自动消失。
// AppToast.vue 挂在 App.vue 里渲染这个状态。

export const toastText = ref('');
const visible = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string, duration = 1600) {
  toastText.value = text;
  visible.value = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    visible.value = false;
  }, duration);
}

export function useToastVisible() {
  return visible;
}
