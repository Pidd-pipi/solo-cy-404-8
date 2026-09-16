import { describe, it, expect } from 'vitest';
import { launchApp, relaunchAt, stores, AppHandle } from './harness';
import { expectIncludes, expectNotIncludes, expectStage } from './assert';
import { richResume, KEPT_TEXT, SENSITIVE } from './fixtures';
import { PrivacyRules } from '../../src/types/privacy';

const ID = 'r_rich';

/** 联系方式全部保留，只让正文规则生效，避免联系方式遮蔽干扰正文断言。 */
function bodyOnlyResume(body: PrivacyRules['body']): ReturnType<typeof richResume> {
  return richResume({
    privacy: {
      enabled: true,
      contacts: { phone: 'keep', email: 'keep', location: 'keep', avatar: 'keep', website: 'keep' },
      body,
    },
  });
}

const OMIT_BODY: PrivacyRules['body'] = { idNumber: 'omit', salary: 'omit', birthDate: 'omit' };
const KEEP_BODY: PrivacyRules['body'] = { idNumber: 'keep', salary: 'keep', birthDate: 'keep' };

async function openConsole(body: PrivacyRules['body']): Promise<AppHandle> {
  const resume = bodyOnlyResume(body);
  return launchApp(`/delivery/${ID}`, () => {
    localStorage.setItem('smart-resume:resumes', JSON.stringify([resume]));
    localStorage.setItem('smart-resume:activeResumeId', JSON.stringify(ID));
  });
}

describe('E2E · 正文三类：省略 / 保留 / 遮蔽 + 刷新重开', () => {
  it('三类全部省略：UI 选中省略，预览移除整段，刷新重开保持，原文不改', async () => {
    const app = await openConsole(OMIT_BODY);

    // —— 阶段：交互后 UI 状态 ——
    expect(app.getBodyAction('idNumber'), '[证件号] 阶段「交互」应选中省略').toBe('省略');
    expect(app.getBodyAction('salary'), '[薪资] 阶段「交互」应选中省略').toBe('省略');
    expect(app.getBodyAction('birthDate'), '[出生日期] 阶段「交互」应选中省略').toBe('省略');

    const assertOmittedView = (h: AppHandle, stage: string) => {
      const text = h.previewText();
      // 不留原值
      expectNotIncludes(text, SENSITIVE.idNumber, '证件号', stage);
      expectNotIncludes(text, '18000', '薪资', stage);
      expectNotIncludes(text, '25000', '薪资', stage);
      expectNotIncludes(text, '40万', '薪资', stage);
      expectNotIncludes(text, SENSITIVE.salary, '薪资', stage);
      expectNotIncludes(text, SENSITIVE.birthDate, '出生日期', stage);
      expectNotIncludes(text, '1988-11-02', '出生日期', stage);
      // 不留星号与关键字（整段含字段名一起移除）
      expectNotIncludes(text, '****', '正文', stage);
      for (const kw of ['身份证号', '期望薪资', '月薪', '年薪', '出生日期', '生于']) {
        expectNotIncludes(text, kw, '正文关键字', stage);
      }
      // 其他正文保留
      for (const kept of KEPT_TEXT) {
        expectIncludes(text, kept, '非敏感正文', stage);
      }
      // 整句清理结果（无悬空标点）
      expectIncludes(text, '8年产品经验，带过增长团队。', '摘要整句', stage);
      // 列表：纯敏感整行被移除，兄弟行保留；无空项目
      const items = h.previewItems().sort();
      expect(items, `阶段「${stage}」列表项应为清理后的 3 行，实际 ${JSON.stringify(items)}`).toEqual(
        ['按期交付上线', '负责增长，带团队', '转化率提升 32%'].sort(),
      );
    };

    assertOmittedView(app, '首次预览');

    // —— 阶段：刷新重开（模块重置 + 同一份 localStorage）——
    const reopened = await relaunchAt(app, `/delivery/${ID}`);
    expectStage(reopened.host.textContent?.includes('投递脱敏保护'), '页面', '刷新后重开');
    expect(reopened.getBodyAction('idNumber'), '[证件号] 阶段「刷新重开」仍应选中省略').toBe('省略');
    expect(reopened.getBodyAction('salary'), '[薪资] 阶段「刷新重开」仍应选中省略').toBe('省略');
    expect(reopened.getBodyAction('birthDate'), '[出生日期] 阶段「刷新重开」仍应选中省略').toBe('省略');
    assertOmittedView(reopened, '刷新后预览');

    // —— 阶段：原简历/存储始终明文，规则不回写 ——
    const { useResumeStore } = await stores();
    const raw = useResumeStore.getState().resumes.find((r) => r.id === ID)!;
    expectStage(raw.summary.includes(SENSITIVE.idNumber), '原简历摘要', '仍为明文');
    expectStage(raw.workExperiences[0].responsibilities[0].includes('18000'), '原简历工作经历', '仍为明文');
    expectStage(raw.projects[0].outcomes[0] === '年薪40万', '原简历项目成果', '仍为明文');
  });

  it.each([
    {
      field: 'idNumber' as const,
      label: '证件号',
      masked: '身份证号********',
      raw: SENSITIVE.idNumber,
    },
    {
      field: 'salary' as const,
      label: '薪资',
      masked: '期望薪资****',
      raw: SENSITIVE.salary,
    },
    {
      field: 'birthDate' as const,
      label: '出生日期',
      masked: '出生日期****-**-**',
      raw: SENSITIVE.birthDate,
    },
  ])('$label：遮蔽保留字段名+星号，切到保留恢复原值，其它两类仍省略不受影响', async ({ field, label, masked, raw }) => {
    // 初始：三类全省略
    const app = await openConsole(OMIT_BODY);
    const others: Record<string, string[]> = {
      idNumber: ['期望薪资', '月薪', '出生日期', '生于'],
      salary: ['身份证号', '出生日期', '生于'],
      birthDate: ['身份证号', '期望薪资', '月薪', '年薪'],
    };

    // 仅把当前字段切到遮蔽
    await app.setBodyAction(field, 'mask');
    expect(app.getBodyAction(field), `[${label}] 阶段「切遮蔽」`).toBe('遮蔽');
    let text = app.previewText();
    expectIncludes(text, masked, label, '遮蔽预览');
    expectNotIncludes(text, raw, label, '遮蔽预览');
    for (const kw of others[field]) {
      expectNotIncludes(text, kw, '其它字段', '遮蔽预览（其它仍省略）');
    }

    // 再切到保留：原值恢复
    await app.setBodyAction(field, 'keep');
    expect(app.getBodyAction(field), `[${label}] 阶段「切保留」`).toBe('保留');
    text = app.previewText();
    expectIncludes(text, raw, label, '保留预览');
    for (const kw of others[field]) {
      expectNotIncludes(text, kw, '其它字段', '保留预览（其它仍省略）');
    }

    // 刷新后该字段仍为保留、其它仍省略
    const reopened = await relaunchAt(app, `/delivery/${ID}`);
    expect(reopened.getBodyAction(field), `[${label}] 阶段「刷新重开」`).toBe('保留');
    text = reopened.previewText();
    expectIncludes(text, raw, label, '刷新后保留预览');
    for (const kw of others[field]) {
      expectNotIncludes(text, kw, '其它字段', '刷新后仍省略');
    }
  });

  it('在三类之间反复切换结果稳定且不叠加（遮蔽星号不重复）', async () => {
    const app = await openConsole(KEEP_BODY);
    await app.setBodyAction('idNumber', 'mask');
    await app.setBodyAction('salary', 'mask');
    await app.setBodyAction('birthDate', 'mask');
    const first = app.previewText();
    // 再点一次同样的动作（模拟重复设置/连续导出）
    await app.setBodyAction('idNumber', 'mask');
    await app.setBodyAction('salary', 'mask');
    await app.setBodyAction('birthDate', 'mask');
    expect(app.previewText(), '重复设置遮蔽后结果必须一致').toBe(first);
    const stars = (s: string) => (s.match(/\*{4}/g) || []).length;
    expect(stars(app.previewText()), '星号标记数量不得增长').toBe(stars(first));
  });
});
