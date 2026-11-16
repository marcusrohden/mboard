import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import './index.css';

const ROOT_ELEMENT_ID = 'root';

/**
 * Mounts the React app into the root element declared in `index.html`.
 */
function mountApp(): void {
  const container = document.getElementById(ROOT_ELEMENT_ID);
  if (container === null) {
    throw new Error(
      `index.html has no #${ROOT_ELEMENT_ID} element to mount mboard into.`,
    );
  }
  createRoot(container).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  );
}

mountApp();
