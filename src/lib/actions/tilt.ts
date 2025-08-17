import type { Action } from 'svelte/action';

// Lightweight tilt hover action. Uses transform-style: preserve-3d on parent.
export const tilt: Action<HTMLElement, { max?: number; scale?: number } | undefined> = (node, opts) => {
  const config = { max: 10, scale: 1.02, ...(opts || {}) };
  let rect = node.getBoundingClientRect();
  let raf = 0;
  let hover = false;

  const onEnter = () => { hover = true; rect = node.getBoundingClientRect(); };
  const onLeave = () => {
    hover = false;
    node.style.transform = 'rotateX(0deg) rotateY(0deg)';
  };

  const onMove = (e: MouseEvent) => {
    if (!hover) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const rx = (-dy * config.max).toFixed(2);
      const ry = (dx * config.max).toFixed(2);
      node.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
  };

  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mouseleave', onLeave);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('resize', () => (rect = node.getBoundingClientRect()));

  return {
    destroy() {
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('mousemove', onMove);
    },
  };
};


