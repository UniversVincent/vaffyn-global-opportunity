import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useGuestState } from '~/data-provider';

export default function ResearchGate({ children }: { children: ReactNode }) {
  const state = useGuestState();
  if (state.isLoading) return null;
  return state.data?.membership === 'advanced' ? (
    <>{children}</>
  ) : (
    <Navigate to="/?membership=1" replace />
  );
}
