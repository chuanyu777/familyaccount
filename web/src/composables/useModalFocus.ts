import { nextTick, onBeforeUnmount, onMounted, type Ref } from 'vue';

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface ModalLayer {
  root: Ref<HTMLElement | null>;
  onEscape: () => void;
  restoreTargets: HTMLElement[];
}

const modalStack: ModalLayer[] = [];
let previousOverflow: string | null = null;

function getTopLayer(): ModalLayer | undefined {
  return modalStack[modalStack.length - 1];
}

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  return root ? [...root.querySelectorAll<HTMLElement>(FOCUSABLE)] : [];
}

function onDocumentKeydown(event: KeyboardEvent): void {
  const layer = getTopLayer();
  if (!layer) return;

  if (event.key === 'Escape') return layer.onEscape();
  if (event.key !== 'Tab') return;

  const nodes = getFocusable(layer.root.value);
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
}

function restoreLayerFocus(layer: ModalLayer): void {
  const nextLayer = getTopLayer();
  if (nextLayer?.root.value) {
    const target = layer.restoreTargets.find(
      (candidate) => candidate.isConnected && nextLayer.root.value?.contains(candidate),
    );
    (target ?? getFocusable(nextLayer.root.value)[0])?.focus();
    return;
  }

  layer.restoreTargets.find((candidate) => candidate.isConnected)?.focus();
}

export function useModalFocus(root: Ref<HTMLElement | null>, onEscape: () => void): void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const layer: ModalLayer = { root, onEscape, restoreTargets: opener ? [opener] : [] };

  onMounted(async () => {
    const parentLayer = getTopLayer();
    layer.restoreTargets.push(...(parentLayer?.restoreTargets ?? []));
    modalStack.push(layer);

    if (modalStack.length === 1) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onDocumentKeydown);
    }

    await nextTick();
    if (getTopLayer() === layer) getFocusable(root.value)[0]?.focus();
  });

  onBeforeUnmount(() => {
    const index = modalStack.indexOf(layer);
    if (index === -1) return;

    const wasTopLayer = index === modalStack.length - 1;
    modalStack.splice(index, 1);

    if (modalStack.length === 0) {
      document.removeEventListener('keydown', onDocumentKeydown);
      document.body.style.overflow = previousOverflow ?? '';
      previousOverflow = null;
    }

    if (wasTopLayer) restoreLayerFocus(layer);
  });
}
