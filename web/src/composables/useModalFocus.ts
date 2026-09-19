import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue';

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function useModalFocus(root: Ref<HTMLElement | null>, onEscape: () => void): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return onEscape();
    if (event.key !== 'Tab' || !root.value) return;

    const nodes = [...root.value.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (nodes.length === 0) return event.preventDefault();
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  onMounted(async () => {
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeydown);
    await nextTick();
    root.value?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = previousOverflow;
    opener?.focus();
  });
}
