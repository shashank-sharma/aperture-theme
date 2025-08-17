export type MediaKind = 'image' | 'video' | 'yt-video';

export interface GalleryItem {
  id: string;
  kind: MediaKind;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  caption?: string;
  tags?: string[];
  url?: string; // optional external link (e.g., YouTube)
  // Optional initial transform overrides
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  scale?: number;
}

export interface GalleryConfig {
  perspective: number; // px
  cardBaseSize: number; // clamp base size
  gap: number; // stack gap
  parallaxStrength: number; // scroll modifier
  hoverLift: number; // px
  hoverScale: number;
  inertia: number; // 0..1 smoothing factor for scroll
  thickness?: number; // px depth of 3D slab sides
  edgeAmplify?: number; // multiplier 0..1+ to push visible faces outward
  depthBlur?: number; // px blur applied to top/right depth faces
  filters?: string[]; // list of tag filters to display (e.g., ['All','Nature'])
  debug?: boolean; // show dev-only controls like TransformTuner
  // Progressive loading
  progressiveThreshold?: number; // if items > threshold, show after eager set
  eagerCount?: number; // number of items to fully preload before showing
  preloadConcurrency?: number; // background preload concurrency
  predictiveBuffer?: number; // how many ahead to prefetch (reserved for future)
  logoSrc?: string; // site logo path (e.g., '/logo.svg')
}


