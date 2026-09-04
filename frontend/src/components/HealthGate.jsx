import React, { useState, useEffect } from 'react';
import { useHealthStore } from '@/store';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function HealthGate({ children }) {
  const status = useHealthStore((state) => state.status);
  const setStatus = useHealthStore((state) => state.setStatus);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
      try {
        const res = await fetch(`${baseUrl}/api/health`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.status === 'ok' || res.status === 200) {
            if (mounted) setStatus('ok');
            return;
          }
        }
        throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        if (mounted) {
          const timer = setTimeout(() => {
            if (mounted) setAttempts((prev) => prev + 1);
          }, 3000);
          return () => clearTimeout(timer);
        }
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, [attempts, setStatus]);

  if (status !== 'ok') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <div className="flex max-w-md flex-col items-center space-y-5 text-center p-8 rounded-2xl border bg-card shadow-lg">
          <div className="relative flex items-center justify-center">
            <div className="absolute h-16 w-16 rounded-full bg-primary/10 animate-ping" />
            <div className="relative p-4 rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Connecting to Demo.pay Engine
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Verifying backend health and waking server instance. The application will unlock automatically once online.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Pinging /api/health {attempts > 0 ? `(attempt ${attempts + 1})` : ''}
          </div>
          {attempts >= 5 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttempts((c) => c + 1)}
              className="text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry Connection
            </Button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
