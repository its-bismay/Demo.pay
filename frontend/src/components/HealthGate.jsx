import React from 'react';
import { useHealthStore } from '@/store';
import { AlertTriangle } from 'lucide-react';

export function HealthGate({ children }) {
  const status = useHealthStore((state) => state.status);

  if (status !== 'ok') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
        <div className="flex max-w-md flex-col items-center space-y-4 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-bold tracking-tight">System Offline</h2>
          <p className="text-muted-foreground">
            The AI Revenue Recovery engine is currently unavailable or undergoing maintenance. 
            Please check back later.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
