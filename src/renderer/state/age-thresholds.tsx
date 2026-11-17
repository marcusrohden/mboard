import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_AGE_THRESHOLDS, type AgeThresholds } from '../../domain';
import { getMboardApi } from '../mboard-api';
import { useLoadedAndPushed } from './use-loaded-and-pushed';

const AgeThresholdsContext = createContext<AgeThresholds>(DEFAULT_AGE_THRESHOLDS);

/**
 * Loads the age-colour thresholds from main and follows every change, so that the age chips, the cards'
 * edges, the Stale only filter and Settings all use the same ones. The defaults apply until they arrive.
 */
export function AgeThresholdsProvider({ children }: { children: ReactNode }) {
  const api = getMboardApi();
  const thresholds = useLoadedAndPushed(api.getAgeThresholds, api.onAgeThresholds);
  return <AgeThresholdsContext value={thresholds ?? DEFAULT_AGE_THRESHOLDS}>{children}</AgeThresholdsContext>;
}

/** The age-colour thresholds in force. */
export function useAgeThresholds(): AgeThresholds {
  return useContext(AgeThresholdsContext);
}
