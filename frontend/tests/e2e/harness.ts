import { afterEach, vi } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

const CONTACT_LABELS = ['电话', '邮箱', '地址', '头像', '主页'] as const;
const BODY_LABELS = { idNumber: '证件号', salary: '薪资', birthDate: '出生日期' } as const;

export type BodyKey = keyof typeof BODY_LABELS;
export type ContactLabel = (typeof CONTACT_LABELS)[number];
export type Action = 'keep' | 'mask' | 'omit';
const ACTION_TEXT: Record<Action, string> = { keep: '保留', mask: '遮蔽', omit: '省略' };
type RouterInstance = { navigate: (to: string, opts?: { replace?: boolean }) => Promise<unknown> };

export interface AppHandle {
  router: RouterInstance;
  root: Root;
  host: HTMLElement;
  goto: (path: string) => Promise<void>;
  setBodyAction: (field: BodyKey, action: Action) => Promise<void>;
  getBodyAction: (field: BodyKey) => string | null;
  setContactAction: (label: ContactLabel, action: Action) => Promise<void>;
  getContactAction: (label: ContactLabel) => string | null;
  setProtectionEnabled: (enabled: boolean) => Promise<void>;
  isProtectionEnabled: () => boolean;
  applyPreset: (name: '默认保护' | '严格投递' | '暂不脱敏') => Promise<void>;
  previewText: () => string;
  /** 投递预览中所有 <li> 的可见文本（工作责任/成就、项目成果等）。 */
  previewItems: () => string[];
  /** 投递预览头像 <img> 的 src（无头像时为 null）。 */
  previewAvatarSrc: () => string | null;
  /** 整页可见文本（用于核对页面控制本身是否误展示原值）。 */
  pageText: () => string;
}

/** 在重置模块前注入 localStorage（用于模拟旧备份等预置数据）。 */
export type Preload = () => void;

async function click(el: Element | null | undefined) {
  if (!el) {
    throw new Error('click: 目标元素不存在');
  }
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function findActionGroup(label: string): HTMLElement {
  const group = document.querySelector(`[aria-label="${label}处理方式"]`);
  if (!group) {
    throw new Error(`找不到分段控件：${label}处理方式`);
  }
  return group as HTMLElement;
}

function actionButton(group: HTMLElement, action: Action): HTMLButtonElement {
  const btn = Array.from(group.querySelectorAll('button')).find((b) => b.textContent?.trim() === ACTION_TEXT[action]);
  if (!btn) {
    throw new Error(`分段控件缺少按钮：${ACTION_TEXT[action]}`);
  }
  return btn;
}

function pressedAction(group: HTMLElement): string | null {
  const pressed = group.querySelector('button[aria-pressed="true"]');
  return pressed ? pressed.textContent?.trim() ?? null : null;
}

function masterSwitch(): HTMLButtonElement {
  const sw = document.querySelector('[role="switch"][aria-label="投递脱敏保护开关"]') as HTMLButtonElement | null;
  if (!sw) {
    throw new Error('找不到总开关 Switch');
  }
  return sw;
}

function buildHandle(router: RouterInstance, root: Root, host: HTMLElement): AppHandle {
  return {
    router,
    root,
    host,
    async goto(path) {
      await act(async () => {
        await router.navigate(path);
      });
      await act(async () => {});
    },
    async setBodyAction(field, action) {
      await click(actionButton(findActionGroup(BODY_LABELS[field]), action));
      await act(async () => {});
    },
    getBodyAction(field) {
      return pressedAction(findActionGroup(BODY_LABELS[field]));
    },
    async setContactAction(label, action) {
      await click(actionButton(findActionGroup(label), action));
      await act(async () => {});
    },
    getContactAction(label) {
      return pressedAction(findActionGroup(label));
    },
    async setProtectionEnabled(enabled) {
      const sw = masterSwitch();
      const isOn = sw.getAttribute('aria-checked') === 'true';
      if (isOn !== enabled) {
        await click(sw);
        await act(async () => {});
      }
    },
    isProtectionEnabled() {
      return masterSwitch().getAttribute('aria-checked') === 'true';
    },
    async applyPreset(name) {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === name);
      if (!btn) {
        throw new Error(`找不到预设按钮：${name}`);
      }
      await click(btn);
      await act(async () => {});
    },
    previewText() {
      const article = document.querySelector('article');
      if (!article) {
        throw new Error('投递预览未渲染 <article>');
      }
      return (article.textContent ?? '').replace(/\s+/g, ' ');
    },
    previewItems() {
      return Array.from(document.querySelectorAll('article li')).map((li) => (li.textContent ?? '').replace(/\s+/g, ' ').trim());
    },
    previewAvatarSrc() {
      return document.querySelector('article img')?.getAttribute('src') ?? null;
    },
    pageText() {
      return (document.body.textContent ?? '').replace(/\s+/g, ' ');
    },
  };
}

async function mountRouter(router: RouterInstance): Promise<{ root: Root; host: HTMLElement }> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(RouterProvider, { router: router as never }));
  });
  return { root, host };
}

/**
 * 启动一次完全隔离的“真实应用”：清空真实 localStorage、重置模块（等价刷新），
 * 挂载真实 createBrowserRouter + 全部页面。preload 在模块加载前写入存储（模拟备份/旧数据）。
 */
export async function launchApp(initialPath = '/resumes', preload?: Preload): Promise<AppHandle> {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  vi.resetModules();
  preload?.();

  const { router } = await import('../../src/router');
  const r = router as unknown as RouterInstance;
  const { root, host } = await mountRouter(r);
  if (initialPath !== '/resumes') {
    await act(async () => {
      await r.navigate(initialPath);
    });
    await act(async () => {});
  }
  return buildHandle(r, root, host);
}

/**
 * 模拟浏览器刷新：卸载并重置模块（store/页面全部重新初始化），但保留 localStorage，
 * 然后重新挂载真实应用并跳到指定路由。用于验证“刷新重开”后规则仍然生效。
 */
export async function relaunchAt(prev: AppHandle, path: string): Promise<AppHandle> {
  await act(async () => {
    prev.root.unmount();
  });
  document.body.innerHTML = '';
  // 关键：不清理 localStorage，仅重置模块图，等价于同一存储下的整页刷新。
  vi.resetModules();

  const { router } = await import('../../src/router');
  const r = router as unknown as RouterInstance;
  const { root, host } = await mountRouter(r);
  await act(async () => {
    await r.navigate(path);
  });
  await act(async () => {});
  return buildHandle(r, root, host);
}

/** 拿到当前模块实例里的真实 store（仍是页面自身在用的同一个 zustand store）。 */
export async function stores() {
  const [{ useResumeStore }, { useProfileStore }] = await Promise.all([
    import('../../src/stores/resume'),
    import('../../src/stores/profile'),
  ]);
  return { useResumeStore, useProfileStore };
}

afterEach(async () => {
  await act(async () => {});
  document.body.innerHTML = '';
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});
