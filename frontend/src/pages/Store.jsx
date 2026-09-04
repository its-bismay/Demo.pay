import React, { useState, useEffect } from 'react';
import { ShoppingBag, Search, AlertCircle, Loader2, CreditCard, Smartphone, Phone, PhoneCall, LogOut, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import logoImage from '@/assets/icon.png';
import { api } from '@/lib/api';

import { useSessionStore, useCartStore, useLiveFeedStore, useVoiceCallStore } from '@/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';

const loginSchema = z.object({
  name: z.string().min(2, 'Name is too short'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
});

function StoreAuthGate({ onLogin }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
  });
  const { login } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const onSubmit = async (data) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/customer/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const { customer, token } = await res.json();
      login(customer, token);
      if (onLogin) onLogin(customer);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <img src={logoImage} alt="Demo.pay" className="h-10 object-contain" />
          </div>
          <CardTitle>Welcome to the Store</CardTitle>
          <CardDescription>
            Enter your details to access the demo store and test autonomous revenue recovery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" placeholder="John Doe" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="john@example.com" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="phone">Phone Number</Label>
                <span className="text-[11px] text-muted-foreground font-normal">Optional (WhatsApp recovery)</span>
              </div>
              <Input id="phone" placeholder="+91 98765 43210" {...register('phone')} />
            </div>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Enter Store'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductGrid() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');
  const setSelectedProduct = useCartStore(state => state.setSelectedProduct);
  const setCheckoutDrawerOpen = useCartStore(state => state.setCheckoutDrawerOpen);

  useEffect(() => {
    api('/api/store/products')
      .then(data => setProducts(data.products))
      .catch(console.error)
      .finally(() => setLoadingProducts(false));
  }, []);

  const filteredProducts = activeCategory === 'All'
    ? products
    : products.filter(p => p.category === activeCategory);

  const categories = ['All', ...new Set(products.map(p => p.category))];

  const customer = useSessionStore(state => state.customer);
  const logout = useSessionStore(state => state.logout);

  const handleLogout = () => {
    logout();
    useCartStore.getState().clearCart();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg border">
        <div className="flex items-center gap-2">
          <img src={logoImage} alt="Demo.pay" className="h-8 object-contain" />
        </div>

        <div className="flex-1 max-w-md w-full relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." className="pl-9 bg-background" />
        </div>

        <div className="flex items-center gap-3">
          <Tabs value={activeCategory} onValueChange={setActiveCategory} className="hidden md:block">
            <TabsList>
              {categories.map(cat => (
                <TabsTrigger key={cat} value={cat}>{cat}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {customer && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 border text-xs text-foreground shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium truncate max-w-[100px] sm:max-w-[140px]">{customer.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-1 text-muted-foreground hover:text-destructive p-0"
                onClick={handleLogout}
                title="Log out session"
              >
                <LogOut className="h-3 w-3" />
              </Button>
            </div>
          )}

          <Button variant="outline" size="icon" className="relative shrink-0" onClick={() => useCartStore.getState().setCartDrawerOpen(true)}>
            <ShoppingBag className="h-5 w-5" />
            <Badge className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs">
              {useCartStore(state => state.cartItems.reduce((acc, item) => acc + item.quantity, 0))}
            </Badge>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <Card key={product.id} className="overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group" onClick={() => setSelectedProduct(product)}>
            <div className="aspect-[4/3] overflow-hidden bg-muted">
              <img
                src={product.image_url}
                alt={product.name}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            </div>
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-start gap-2">
                <CardTitle className="text-lg line-clamp-1">{product.name}</CardTitle>
                <Badge variant="secondary">{product.category}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 pb-4">
              <div className="flex justify-between items-center mt-2">
                <span className="font-bold text-lg">₹{(product.priceInPaise / 100).toLocaleString()}</span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  ⭐ {product.ratingValue || 'N/A'} ({product.ratingCount || 0})
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ProductDetailModal() {
  const selectedProduct = useCartStore(state => state.selectedProduct);
  const setSelectedProduct = useCartStore(state => state.setSelectedProduct);
  const setCheckoutDrawerOpen = useCartStore(state => state.setCheckoutDrawerOpen);

  if (!selectedProduct) return null;

  return (
    <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-0">
        <DialogHeader className="sr-only">
          <DialogTitle>{selectedProduct.name}</DialogTitle>
          <DialogDescription>Product details</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-video w-full bg-muted">
          <img src={selectedProduct.image_url} alt={selectedProduct.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />
          <div className="absolute bottom-4 left-4 right-4 text-foreground">
            <Badge className="mb-2 bg-primary text-primary-foreground">{selectedProduct.category}</Badge>
            <h2 className="text-2xl font-bold text-foreground">{selectedProduct.name}</h2>
          </div>
        </div>
        <div className="p-6 pt-2 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-3xl font-bold">₹{(selectedProduct.priceInPaise / 100).toLocaleString()}</span>
            <span className="text-lg font-medium flex items-center gap-1">⭐ {selectedProduct.ratingValue || 'N/A'} <span className="text-sm text-muted-foreground ml-1">({selectedProduct.ratingCount || 0} ratings)</span></span>
          </div>
          <p className="text-base text-muted-foreground">
            This is a premium {selectedProduct.category.toLowerCase()} product. Built with high-quality materials and designed to last. Ideal for your daily usage.
          </p>
        </div>
        <DialogFooter className="p-6 pt-0 sm:justify-start">
          <Button
            className="w-full sm:w-auto"
            size="lg"
            onClick={() => {
              useCartStore.getState().addToCart(selectedProduct);
              setSelectedProduct(null);
              useCartStore.getState().setCartDrawerOpen(true);
            }}
          >
            <ShoppingBag className="mr-2 h-5 w-5" />
            Add to Bag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { Trash2 } from 'lucide-react';

function CartDrawer() {
  const isOpen = useCartStore(state => state.cartDrawerOpen);
  const setOpen = useCartStore(state => state.setCartDrawerOpen);
  const cartItems = useCartStore(state => state.cartItems);
  const removeFromCart = useCartStore(state => state.removeFromCart);
  const setCheckoutDrawerOpen = useCartStore(state => state.setCheckoutDrawerOpen);
  const setCurrentOrderId = useCartStore(state => state.setCurrentOrderId);
  const [orderLoading, setOrderLoading] = useState(false);

  const cartTotal = cartItems.reduce((acc, item) => acc + (Math.round(item.product.priceInPaise / 100) * item.quantity), 0);

  const handleProceedToCheckout = async () => {
    setOrderLoading(true);
    try {
      const data = await api('/api/checkout/order', {
        method: 'POST',
        body: JSON.stringify({
          items: cartItems.map(i => ({ productId: i.product.id, quantity: i.quantity })),
        }),
      });
      setCurrentOrderId(data.orderId);
      setOpen(false);
      setCheckoutDrawerOpen(true);
    } catch (e) {
      console.error('Failed to create order:', e);
      alert('Failed to create order: ' + (e.message || 'Error'));
    } finally {
      setOrderLoading(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle>Your Bag</SheetTitle>
          <SheetDescription>Review your items before checkout.</SheetDescription>
        </SheetHeader>

        <div className="mt-2 flex-1 space-y-4 px-6 overflow-y-auto">
          {cartItems.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">Your bag is empty.</div>
          ) : (
            cartItems.map((item) => (
              <div key={item.product.id} className="flex gap-4 p-4 border rounded-lg bg-card">
                <div className="w-20 h-20 rounded-md overflow-hidden bg-muted shrink-0">
                  <img src={item.product.image_url} alt={item.product.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <h4 className="font-semibold text-sm line-clamp-2">{item.product.name}</h4>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeFromCart(item.product.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Qty: {item.quantity}</span>
                    <span className="font-bold">₹{(Math.round(item.product.priceInPaise / 100) * item.quantity).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {cartItems.length > 0 && (
          <div className="pt-6 border-t mt-auto space-y-4 px-6 pb-6 bg-background">
            <div className="flex justify-between items-center font-bold text-lg">
              <span>Total</span>
              <span>₹{cartTotal.toLocaleString()}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={orderLoading}
              onClick={handleProceedToCheckout}
            >
              {orderLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Proceed to Checkout
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CheckoutDrawer() {
  const isOpen = useCartStore(state => state.checkoutDrawerOpen);
  const setOpen = useCartStore(state => state.setCheckoutDrawerOpen);
  const customer = useSessionStore(state => state.customer);
  const addEvent = useLiveFeedStore(state => state.addEvent);
  const updateKpis = useLiveFeedStore(state => state.updateKpis);

  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [simulatingId, setSimulatingId] = useState(null);
  const [simulatedAction, setSimulatedAction] = useState(null);

  const cartItems = useCartStore(state => state.cartItems);
  const cartTotal = cartItems.reduce((acc, item) => acc + (Math.round(item.product.priceInPaise / 100) * item.quantity), 0);

  // Abandon timer
  useEffect(() => {
    let timer;
    if (isOpen && !simulatingId && !simulatedAction) {
      timer = setTimeout(() => {
        addEvent({ id: Date.now().toString(), type: 'abandonment', message: `Customer ${customer?.name} abandoned checkout.` });
        setSimulatedAction({ type: 'Abandonment', desc: 'User was inactive for 30 seconds on the checkout screen.' });
      }, 30000);
    }
    return () => clearTimeout(timer);
  }, [isOpen, simulatingId, simulatedAction, customer, addEvent]);

  const triggerCall = useVoiceCallStore(state => state.triggerCall);

  const startVoiceCall = async (targetOrderId) => {
    const oid = targetOrderId || useCartStore.getState().currentOrderId;
    try {
      if (oid) {
        const data = await api('/api/voice/initiate', {
          method: 'POST',
          body: JSON.stringify({ orderId: oid }),
        });
        triggerCall(data);
        return;
      }
    } catch (e) {
      console.warn('Voice call initiate error:', e);
    }
    // Fallback data
    triggerCall({
      orderId: oid,
      customerName: customer?.name || 'Customer',
      productName: cartItems[0]?.product?.name || 'Order Items',
      amountInRs: cartTotal || 2499,
      discountPct: 10,
      script: `Namaste ${customer?.name || 'Customer'}! Main Demo.pay recovery desk se Aditi baat kar rahi hoon. Maine dekha aapka payment complete nahi ho paya. Humne aapke liye ek special 10% discount activate kiya hai. Kya aap abhi order complete karna chahenge ya kal schedule karein?`,
    });
  };

  const handleSimulate = async (scenario, desc, id) => {
    const orderId = useCartStore.getState().currentOrderId;
    if (!orderId) {
      alert('Please create an order first by proceeding to checkout.');
      return;
    }
    setSimulatingId(id);
    try {
      const scenarioMapping = {
        funds: 'insufficient_funds',
        timeout: 'gateway_timeout',
        upi: 'upi_unreachable',
        pin: 'auth_failed',
        success: 'successful_payment',
      };
      const apiScenario = scenarioMapping[id] || id;

      await api('/api/checkout/simulate', {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          scenario: apiScenario,
          paymentMethod,
        }),
      });
      setSimulatedAction({ type: scenario, desc });
      addEvent({
        id: Date.now().toString(),
        type: id === 'success' ? 'success' : 'failure',
        message: id === 'success' ? `Payment captured for ${customer?.name}.` : `Payment failed for ${customer?.name} due to ${scenario}.`,
      });
      if (id !== 'success') {
        updateKpis({ atRisk: cartTotal, activeInterventions: 1 });
        // Auto-call recovery agent in 3 seconds
        setTimeout(() => {
          startVoiceCall(orderId);
        }, 3000);
      }
    } catch (e) {
      console.error('Simulation error:', e);
      alert('Simulation failed: ' + (e.message || 'Error'));
    } finally {
      setSimulatingId(null);
    }
  };

  const closeConfirmation = () => {
    setSimulatedAction(null);
    setOpen(false);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Checkout (₹{cartTotal.toLocaleString()})</SheetTitle>
            <SheetDescription>Complete your purchase securely.</SheetDescription>
          </SheetHeader>

          <div className="mt-2 space-y-8 px-6 pb-6">
            {/* Payment Method */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Payment Method</h3>
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`border rounded-lg p-4 cursor-pointer flex flex-col items-center gap-2 transition-colors ${paymentMethod === 'upi' ? 'border-primary bg-primary/10 text-primary' : 'hover:border-primary/50 text-muted-foreground'}`}
                  onClick={() => setPaymentMethod('upi')}
                >
                  <Smartphone className={`h-6 w-6 ${paymentMethod === 'upi' ? 'text-primary' : ''}`} />
                  <span className="font-medium text-foreground">UPI</span>
                </div>
                <div
                  className={`border rounded-lg p-4 cursor-pointer flex flex-col items-center gap-2 transition-colors ${paymentMethod === 'card' ? 'border-primary bg-primary/10 text-primary' : 'hover:border-primary/50 text-muted-foreground'}`}
                  onClick={() => setPaymentMethod('card')}
                >
                  <CreditCard className={`h-6 w-6 ${paymentMethod === 'card' ? 'text-primary' : ''}`} />
                  <span className="font-medium text-foreground">Card</span>
                </div>
              </div>
            </div>

            <Separator />

            {/* Simulate Actions */}
            <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-dashed">
              <h3 className="font-semibold text-lg text-primary flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Simulate Outcome
              </h3>
              <p className="text-sm text-muted-foreground">Click a button below to trigger a synthetic webhook and test the AI recovery agent.</p>

              <div className="flex flex-col gap-2">
                <Button className="justify-start bg-red-600 hover:bg-red-700 text-white border-0" onClick={() => handleSimulate('Insufficient Funds', 'Customer has insufficient funds in their bank account.', 'funds')} disabled={!!simulatingId}>
                  {simulatingId === 'funds' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Insufficient Funds
                </Button>
                <Button className="justify-start bg-orange-600 hover:bg-orange-700 text-white border-0" onClick={() => handleSimulate('Bank Timeout', 'The issuing bank took too long to respond.', 'timeout')} disabled={!!simulatingId}>
                  {simulatingId === 'timeout' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Bank Timeout
                </Button>
                <Button className="justify-start bg-amber-600 hover:bg-amber-700 text-white border-0" onClick={() => handleSimulate('UPI App Unreachable', 'The user’s UPI app failed to launch or authorize.', 'upi')} disabled={!!simulatingId}>
                  {simulatingId === 'upi' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  UPI App Unreachable
                </Button>
                <Button className="justify-start bg-purple-600 hover:bg-purple-700 text-white border-0" onClick={() => handleSimulate('Incorrect PIN', 'Customer entered the wrong UPI PIN or CVV.', 'pin')} disabled={!!simulatingId}>
                  {simulatingId === 'pin' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Incorrect PIN
                </Button>
                <Button className="justify-start mt-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => handleSimulate('Success (Baseline)', 'Payment processed successfully. No recovery needed.', 'success')} disabled={!!simulatingId}>
                  {simulatingId === 'success' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Successful Payment
                </Button>

                <div className="pt-2 border-t mt-2">
                  <Button
                    variant="outline"
                    className="w-full justify-start border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary gap-2"
                    onClick={() => startVoiceCall()}
                  >
                    <Phone className="h-4 w-4 text-primary animate-pulse" />
                    📞 Talk to AI Voice Agent (Direct Call)
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!simulatedAction} onOpenChange={(open) => !open && closeConfirmation()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Simulation Triggered</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="mt-2 space-y-4">
                <p className="text-foreground font-medium">Scenario: {simulatedAction?.type}</p>
                <p>{simulatedAction?.desc}</p>
                <div className="bg-muted p-3 rounded-md text-xs font-mono text-muted-foreground">
                  Webhook payload injected into the event queue successfully.
                </div>
                <div className="bg-primary/10 border border-primary/20 p-3 rounded-md space-y-2">
                  <p className="text-primary font-medium animate-pulse text-xs">
                    🔔 Autonomous Voice Agent (Aditi) is calling your browser now...
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-xs"
                    onClick={() => {
                      const oid = useCartStore.getState().currentOrderId;
                      closeConfirmation();
                      startVoiceCall(oid);
                    }}
                  >
                    <PhoneCall className="h-3.5 w-3.5 animate-bounce" />
                    Answer AI Recovery Call
                  </Button>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={closeConfirmation}>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Store() {
  const customer = useSessionStore((state) => state.customer);
  const token = useSessionStore((state) => state.token);
  const setCustomer = useSessionStore((state) => state.setCustomer);

  if (!customer || !token) {
    return <StoreAuthGate onLogin={setCustomer} />;
  }

  return (
    <div className="max-w-7xl mx-auto pb-12 space-y-6">
      <ProductGrid />
      <ProductDetailModal />
      <CartDrawer />
      <CheckoutDrawer />
    </div>
  );
}
