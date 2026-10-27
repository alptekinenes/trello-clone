import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../../shared/lib/http';

export const healthKeys = {
  all: ['health'] as const,
};

export interface HealthResponse {
  status: 'ok';
}

/** Checks whether the backend API is reachable. */
export function useApiHealth() {
  return useQuery({
    queryKey: healthKeys.all,
    queryFn: () => apiRequest<HealthResponse>('/health'),
    retry: false,
  });
}
