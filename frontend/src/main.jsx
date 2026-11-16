import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { createAppQueryClient } from './lib/queryClient';
import App from './App';
import NotificationProvider from './lib/NotificationProvider';
import CrashBoundary from './modules/crash-reports/CrashBoundary';
import CrashReporter from './modules/crash-reports/CrashReporter';
// SAP 72 / 72 Mono, self-hosted from SAP's open-source theme package.
import './ui/fonts.css';
import './index.css';

const queryClient = createAppQueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        {/* A crash anywhere is a recovery panel, not a white page; the
            reporter sits beside the app so it works when the app does not. */}
        <CrashBoundary variant="page">
          <App />
        </CrashBoundary>
        <CrashReporter />
      </NotificationProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
