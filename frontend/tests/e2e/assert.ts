import { expect } from 'vitest';
import type { AppHandle } from './harness';

/** 带“字段 + 阶段”上下文的断言：失败时直接指出是哪个字段、在哪个环节出问题。 */
export function expectStage(condition: unknown, field: string, stage: string, detail = ''): asserts condition {
  expect(condition, `[${field}] 阶段「${stage}」${detail}`).toBeTruthy();
}

export function expectNotIncludes(haystack: string, needle: string, field: string, stage: string) {
  expect(haystack.includes(needle), `[${field}] 阶段「${stage}」发生泄露，仍包含 ${JSON.stringify(needle)}；实际：${JSON.stringify(haystack.slice(0, 200))}`).toBe(
    false,
  );
}

export function expectIncludes(haystack: string, needle: string, field: string, stage: string) {
  expect(haystack.includes(needle), `[${field}] 阶段「${stage}」缺少应保留内容 ${JSON.stringify(needle)}；实际：${JSON.stringify(haystack.slice(0, 200))}`).toBe(
    true,
  );
}

/** 省略后不得残留：原值、星号、字段关键字（整段移除）、悬空标点。 */
export function assertOmittedClean(text: string, rawValue: string, keyword: string, field: string, stage: string) {
  expectNotIncludes(text, rawValue, field, stage);
  expectNotIncludes(text, '****', field, stage);
  expectNotIncludes(text, keyword, field, stage);
  // 悬空标点：连续逗号、句首逗号、逗号紧贴句号
  expectStage(!/，\s*，|^[，,、；;：:]|[，,、；;：:]\s*。|^\s*。/m.test(text), field, `${stage}/悬空标点`, JSON.stringify(text.slice(0, 120)));
}

export async function openConsole(app: AppHandle, resumeId: string): Promise<void> {
  await app.goto(`/delivery/${resumeId}`);
  expectStage(app.host.textContent?.includes('投递脱敏保护'), '页面', '打开脱敏投递台');
}
