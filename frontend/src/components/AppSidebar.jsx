import React from 'react';
import { Home, Store, ShieldCheck, User, LogOut } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import logoImage from '@/assets/icon.png';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSessionStore, useCartStore } from '@/store';
import { ThemeToggle } from '@/components/ThemeToggle';

const items = [
  { title: 'Home', url: '/', icon: Home },
  { title: 'Store', url: '/store', icon: Store },
  { title: 'Admin', url: '/admin', icon: ShieldCheck },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const customer = useSessionStore((state) => state.customer);
  const logout = useSessionStore((state) => state.logout);
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className={`h-14 flex flex-row items-center border-b ${isCollapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!isCollapsed && (
          <img src={logoImage} alt="Demo.pay" className="h-8 object-contain" />
        )}
        <SidebarTrigger />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  isActive={location.pathname === item.url}
                  tooltip={item.title}
                  onClick={() => navigate(item.url)}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t px-2 py-3 space-y-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle collapsed={isCollapsed} />
          </SidebarMenuItem>
        </SidebarMenu>
        {customer ? (
          <div className="flex items-center justify-between gap-2 overflow-hidden py-1 px-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-sidebar-primary/10 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-sidebar-primary" />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col truncate">
                  <span className="text-sm font-medium truncate">{customer.name}</span>
                  <span className="text-xs text-sidebar-foreground/60 truncate">Customer</span>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <button
                type="button"
                onClick={() => {
                  logout();
                  useCartStore.getState().clearCart();
                }}
                className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          !isCollapsed && (
            <p className="text-xs text-sidebar-foreground/60 px-2 pb-1">No active session</p>
          )
        )}
      </SidebarFooter>
    </Sidebar>
  );
}

