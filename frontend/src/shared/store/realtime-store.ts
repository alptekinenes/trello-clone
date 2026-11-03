import { create } from 'zustand';

/**
 * idle: not signed in (no socket). connecting: first connection attempt.
 * connected. reconnecting: the link dropped and is being restored.
 * offline: gave up (session ended or the server keeps refusing the token).
 */
export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface RealtimeState {
  status: RealtimeStatus;
  setStatus: (status: RealtimeStatus) => void;
}

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));

export const useRealtimeStatus = () => useRealtimeStore((state) => state.status);

/** Test helper. */
export function resetRealtimeStore(): void {
  useRealtimeStore.setState({ status: 'idle' });
}
