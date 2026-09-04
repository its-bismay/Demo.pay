import React from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { HealthGate } from '@/components/HealthGate';
import { VoiceCallModal } from '@/components/VoiceCallModal';

import Home from './pages/Home';
import Store from './pages/Store';
import Admin from './pages/Admin';
import { useCartStore, useSessionStore } from './store';

const Layout = () => {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <main className="flex flex-1 flex-col min-h-screen p-4 md:p-6 bg-background">
          <HealthGate>
            <Outlet />
          </HealthGate>
        </main>
      </SidebarInset>
      <VoiceCallModal />
      <Toaster />
    </SidebarProvider>
  );
};

const App = () => {
  React.useEffect(() => {
    const handleUnload = () => {
      const { cartItems, currentOrderId } = useCartStore.getState();
      const token = useSessionStore.getState().token;
      if (cartItems.length > 0 && !currentOrderId && token) {
        navigator.sendBeacon(
          `${import.meta.env.VITE_API_BASE_URL}/api/checkout/abandon-cart`,
          new Blob(
            [
              JSON.stringify({
                cartItems: cartItems.map((i) => ({
                  productId: i.product.id,
                  quantity: i.quantity,
                })),
              }),
            ],
            { type: 'application/json' }
          )
        );
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="store" element={<Store />} />
            <Route path="admin" element={<Admin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  );
};

export default App;