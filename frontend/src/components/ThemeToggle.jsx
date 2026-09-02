import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { SidebarMenuButton } from '@/components/ui/sidebar';

export function ThemeToggle({ collapsed }) {
  const [isDark, setIsDark] = React.useState(() =>
    document.documentElement.classList.contains('dark')
  );

  const toggle = (checked) => {
    const html = document.documentElement;
    if (checked) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    setIsDark(checked);
  };

  if (collapsed) {
    return (
      <SidebarMenuButton tooltip="Toggle theme" onClick={() => toggle(!isDark)}>
        {isDark ? <Sun /> : <Moon />}
      </SidebarMenuButton>
    );
  }

  return (
    <SidebarMenuButton onClick={() => toggle(!isDark)}>
      {isDark ? <Moon /> : <Sun />}
      <span>{isDark ? 'Dark' : 'Light'}</span>
      <div className="ml-auto flex items-center">
        <Switch checked={isDark} onCheckedChange={toggle} aria-label="Toggle theme" onClick={(e) => e.stopPropagation()} />
      </div>
    </SidebarMenuButton>
  );
}
