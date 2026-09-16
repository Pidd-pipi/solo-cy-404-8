// jsdom 缺少 Headless UI v2 依赖的 Web Animations API 与少量 DOM API，这里做最小无副作用补丁。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof Element !== 'undefined' && !(Element.prototype as any).animate) {
  (Element.prototype as any).animate = () =>
    ({
      cancel() {},
      finished: Promise.resolve(),
      onfinish: null,
      play() {},
      pause() {},
      updatePlaybackRate() {},
    } as unknown as Animation);
}

if (typeof Element !== 'undefined' && !(Element.prototype as any).scrollIntoView) {
  (Element.prototype as any).scrollIntoView = () => {};
}

// jsdom 不实现 ResizeObserver / IntersectionObserver；Headless UI 的 Menu 定位会用到。
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): unknown[] {
    return [];
  }
}
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = NoopObserver;
}
if (typeof (globalThis as any).IntersectionObserver === 'undefined') {
  (globalThis as any).IntersectionObserver = NoopObserver;
}

// jsdom 不实现 matchMedia；主题/布局代码若读取会回退，保持返回固定浅色即可。
if (typeof window !== 'undefined' && !(window as any).matchMedia) {
  (window as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}

// 仅屏蔽 React Router v6 的 v7 迁移提示（真实应用入口未开启 future flag）；
// 其它警告（如 act）与错误照常暴露，避免掩盖问题。
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (first.includes('React Router Future Flag Warning')) {
    return;
  }
  originalWarn(...args);
};
