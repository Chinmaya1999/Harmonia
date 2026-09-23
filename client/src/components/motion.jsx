import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const coarse = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

// Reveal-on-scroll for any element with class "reveal". One observer for the
// whole app; a MutationObserver picks up elements added by route changes.
export function useGlobalReveal() {
  useEffect(() => {
    if (reduced() || !('IntersectionObserver' in window)) {
      document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in'));
      return undefined;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    const scan = () => document.querySelectorAll('.reveal:not(.in):not([data-watched])').forEach((el) => { el.setAttribute('data-watched', ''); io.observe(el); });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
}

// 3D tilt with a moving glare. Disabled on touch devices and for reduced motion.
export function Tilt({ as: As = 'div', max = 10, scale = 1.02, className = '', children, style, ...rest }) {
  const ref = useRef(null);
  const onMove = (e) => {
    if (reduced() || coarse()) return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * max}deg) rotateY(${(px - 0.5) * max}deg) scale(${scale})`;
    el.style.setProperty('--gx', `${px * 100}%`);
    el.style.setProperty('--gy', `${py * 100}%`);
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ''; };
  return (
    <As ref={ref} className={`tilt ${className}`} style={style} onMouseMove={onMove} onMouseLeave={onLeave} {...rest}>
      {children}
      <span className="glare" aria-hidden="true" />
    </As>
  );
}

// A perspective stage whose contents rotate gently toward the pointer.
export function Stage3D({ children, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (reduced() || coarse()) return undefined;
    const onMove = (e) => {
      const el = ref.current;
      if (!el) return;
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      el.style.setProperty('--ry', `${-14 + x * 16}deg`);
      el.style.setProperty('--rx', `${8 - y * 10}deg`);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return <div className={`stage ${className}`}><div className="stage-inner" ref={ref}>{children}</div></div>;
}

// Counts up when it scrolls into view.
export function Counter({ to, duration = 1400, format = (n) => Math.round(n).toLocaleString('en-IN'), suffix = '' }) {
  const ref = useRef(null);
  const [val, setVal] = useState(reduced() ? to : 0);
  useEffect(() => {
    if (reduced()) { setVal(to); return undefined; }
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t) => {
        const p = Math.min(1, (t - start) / duration);
        setVal(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return <span ref={ref}>{format(val)}{suffix}</span>;
}
