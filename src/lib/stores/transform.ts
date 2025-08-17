import { writable } from 'svelte/store';

export type TransformState = {
  rotateX: number;
  rotateY: number;
  rotateZ: number;
  skewX: number;
  scale: number;
  perspective: number;
  parallelEdges?: boolean;
};

export const transformStore = writable<TransformState>({
  rotateX: -2,
  rotateY: -17,
  rotateZ: 6,
  skewX: 6,
  scale: 0.6,
  perspective: 1230,
  parallelEdges: false,
});


