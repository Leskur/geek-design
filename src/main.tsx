import { createRoot } from 'react-dom/client';
import { App } from './App';

window.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  },
  { passive: false },
);
window.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (['+', '=', '-', '_', '0'].includes(event.key)) event.preventDefault();
});
for (const name of ['gesturestart', 'gesturechange', 'gestureend'] as const) {
  document.addEventListener(name, (event) => event.preventDefault());
}

createRoot(document.getElementById('root')!).render(<App />);
