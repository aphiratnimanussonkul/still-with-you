import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/hooks/use-auth';
import { env } from '@/lib/env';
import { queryClient } from '@/lib/query-client';
import { startMocks } from '@/lib/start-mocks';
import { App } from './App';
import './index.css';

async function registerPwa() {
  if (env.useMsw) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}

async function bootstrap() {
  if (env.useMsw) {
    await startMocks();
  } else {
    await registerPwa();
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
            <Toaster />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}

void bootstrap();
