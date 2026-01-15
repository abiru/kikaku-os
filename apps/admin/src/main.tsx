import React from 'react';
import ReactDOM from 'react-dom/client';
import { Refine } from '@refinedev/core';
import { BrowserRouter, Outlet, Route, Routes } from 'react-router';
import { RefineKbar, RefineKbarProvider } from '@refinedev/kbar';
import routerProvider from '@refinedev/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

const queryClient = new QueryClient();

const Provider = () => (
  <RefineKbarProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Refine
          routerProvider={routerProvider}
          dataProvider={{
            // We use custom fetch layer inside pages.
            create: () => Promise.resolve({}),
            deleteOne: () => Promise.resolve({}),
            getList: () => Promise.resolve({ data: [], total: 0 }),
            getMany: () => Promise.resolve({ data: [] }),
            getOne: () => Promise.resolve({ data: {} }),
            update: () => Promise.resolve({})
          }}
          options={{ syncWithLocation: false }}
        >
          <Routes>
            <Route path="/*" element={<AppLayout />}></Route>
          </Routes>
          <RefineKbar />
        </Refine>
      </BrowserRouter>
    </QueryClientProvider>
  </RefineKbarProvider>
);

const AppLayout = () => (
  <App>
    <Outlet />
  </App>
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<Provider />);
