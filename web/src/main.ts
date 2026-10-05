import { createApp } from 'vue';
import LedgerLogin from './auth/LedgerLogin.vue';
import PlatformApp from './platform/PlatformApp.vue';
import { surfaceForPathname } from './auth/entryPoint';
import './styles/base.css';

const surface = surfaceForPathname(window.location.pathname);
const root = document.querySelector('#app');

if (root && surface === 'platform') {
  createApp(PlatformApp).mount(root);
} else if (root && surface === 'ledger') {
  createApp(LedgerLogin).mount(root);
} else if (surface === null) {
  // The root URL is intentionally not a third, shared Web client.
  window.location.replace('/ledger');
}
