import type { GalleryConfig } from './types';

export const defaultConfig: GalleryConfig = {
  perspective: 1600,
  cardBaseSize: 720,
  gap: 90,
  parallaxStrength: 0.4,
  hoverLift: 16,
  hoverScale: 1.02,
  inertia: 0.12,
  thickness: 6,
  edgeAmplify: 1,
  depthBlur: 1.2,
  debug: false,
  progressiveThreshold: 20,
  eagerCount: 12,
  preloadConcurrency: 4,
  predictiveBuffer: 8,
  virtualPoolSize: 64,
};