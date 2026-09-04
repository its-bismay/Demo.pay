import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useHealthStore = create(() => ({
  status: 'ok',
}));

export const useSessionStore = create(
  persist(
    (set) => ({
      customer: null,
      token: null,
      setCustomer: (customer) => set({ customer }),
      setToken: (token) => set({ token }),
      login: (customer, token) => set({ customer, token }),
      logout: () => set({ customer: null, token: null }),
    }),
    {
      name: 'demopay-session',   // localStorage key
      partialize: (state) => ({ customer: state.customer, token: state.token }),
    }
  )
);

export const useCartStore = create((set) => ({
  cartItems: [],
  cartDrawerOpen: false,
  selectedProduct: null,
  checkoutDrawerOpen: false,
  
  addToCart: (product) => set((state) => {
    const existing = state.cartItems.find(item => item.product.id === product.id);
    if (existing) {
      return {
        cartItems: state.cartItems.map(item => 
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        )
      };
    }
    return { cartItems: [...state.cartItems, { product, quantity: 1 }] };
  }),
  removeFromCart: (productId) => set((state) => ({
    cartItems: state.cartItems.filter(item => item.product.id !== productId)
  })),
  clearCart: () => set({ cartItems: [] }),

  setCartDrawerOpen: (isOpen) => set({ cartDrawerOpen: isOpen }),
  setSelectedProduct: (product) => set({ selectedProduct: product }),
  setCheckoutDrawerOpen: (isOpen) => set({ checkoutDrawerOpen: isOpen }),
}));

export const useLiveFeedStore = create((set) => ({
  events: [],
  kpis: {
    atRisk: 0,
    recovered: 0,
    recoveryRate: 0,
    activeInterventions: 0,
  },
  addEvent: (event) =>
    set((state) => ({ events: [event, ...state.events] })),
  updateKpis: (newKpis) =>
    set((state) => ({ kpis: { ...state.kpis, ...newKpis } })),
}));

export const usePolicyStore = create((set) => ({
  policy: {
    maxContactsPerDay: 2,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    maxDiscountPct: 15,
    minOrderValue: 2000,
    voiceType: 'Female (Professional / Empathetic)',
    languageMode: 'Hinglish (Hindi + English blend)',
    personaPrompt: 'You are a friendly, empathetic customer support agent for demo.pay. Speak in Hinglish. Offer a 10% discount if the customer hesitates.',
  },
  updatePolicy: (newPolicy) =>
    set((state) => ({ policy: { ...state.policy, ...newPolicy } })),
}));
