import './global.css';
import './ui/styles.css';
import { createApp } from 'vue';
import App from './ui/App.vue';
import { initHost } from './host/events.ts';
import { ensureWandButton, setWandDot } from './host/wand.ts';
import { togglePanel } from './ui/panel-state.ts';
import { reloadSettings } from './store/ui-settings.ts';

function boot(): void {
  reloadSettings();

  const root = document.createElement('div');
  root.id = 'mneme-chronicle-root';
  document.body.appendChild(root);
  createApp(App).mount(root);

  ensureWandButton(() => {
    setWandDot(false);
    togglePanel();
  });
  initHost();
  console.info('[Mneme · 岁记] booted');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
