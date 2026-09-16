import { describe, it, expect } from 'vitest';
import { launchApp, relaunchAt, stores } from './harness';
import { expectIncludes, expectNotIncludes, expectStage } from './assert';
import { richResume } from './fixtures';
import { PrivacyRules } from '../../src/types/privacy';
import { Resume } from '../../src/types/resume';

const ID = 'r_rich';

/** 只保留摘要模块并写入指定正文，联系方式全部保留，三类正文初始都为保留。 */
function summaryOnlyResume(summary: string): Resume {
  return richResume({
    summary,
    workExperiences: [],
    projects: [],
    educations: [],
    sections: [{ id: 'summary', title: '职业摘要', enabled: true }],
    privacy: {
      enabled: true,
      contacts: { phone: 'keep', email: 'keep', location: 'keep', avatar: 'keep', website: 'keep' },
      body: { idNumber: 'keep', salary: 'keep', birthDate: 'keep' } satisfies PrivacyRules['body'],
    },
  });
}

function preload(resume: Resume) {
  return () => {
    localStorage.setItem('smart-resume:resumes', JSON.stringify([resume]));
    localStorage.setItem('smart-resume:activeResumeId', JSON.stringify(ID));
  };
}

describe('E2E · 浏览器实际路径：中文数字金额省略', () => {
  it.each([
    { amount: '一万八千元' },
    { amount: '两万五千元' },
  ])('期望薪资$amount：保留→遮蔽→省略，省略不留原值/星号/悬空标点', async ({ amount }) => {
    const phrase = `期望薪资${amount}`;
    const summary = `可入职，${phrase}，谢谢。`;
    const resume = summaryOnlyResume(summary);
    const app = await launchApp(`/delivery/${ID}`, preload(resume));

    // 保留（初始）：原值与周边正文都在
    let text = app.previewText();
    expectIncludes(text, phrase, '薪资', '保留基线');
    expectIncludes(text, '可入职', '非敏感正文', '保留基线');
    expectIncludes(text, '谢谢', '非敏感正文', '保留基线');

    // 遮蔽：关键字保留、金额变星号，中文金额不残留
    await app.setBodyAction('salary', 'mask');
    expect(app.getBodyAction('salary'), '[薪资] 阶段「遮蔽」选中态').toBe('遮蔽');
    text = app.previewText();
    expectIncludes(text, '期望薪资****', '薪资', '遮蔽');
    expectNotIncludes(text, amount, '薪资', '遮蔽');
    expectIncludes(text, '可入职', '非敏感正文', '遮蔽');
    expectIncludes(text, '谢谢', '非敏感正文', '遮蔽');

    // 省略：整段移除，前后文干净衔接，无原值/星号/悬空标点
    await app.setBodyAction('salary', 'omit');
    expect(app.getBodyAction('salary'), '[薪资] 阶段「省略」选中态').toBe('省略');
    text = app.previewText();
    expectIncludes(text, '可入职，谢谢。', '薪资', '省略衔接');
    expectNotIncludes(text, amount, '薪资', '省略');
    expectNotIncludes(text, '期望薪资', '薪资关键字', '省略');
    expectNotIncludes(text, '****', '薪资', '省略不留星号');
    expectNotIncludes(text, '，，', '薪资', '省略无悬空标点');
    expectNotIncludes(text, '，。', '薪资', '省略无悬空标点');

    // 刷新重开：仍省略、预览仍干净
    const reopened = await relaunchAt(app, `/delivery/${ID}`);
    expect(reopened.getBodyAction('salary'), '[薪资] 阶段「刷新重开」').toBe('省略');
    expectIncludes(reopened.previewText(), '可入职，谢谢。', '薪资', '刷新后省略衔接');
    expectNotIncludes(reopened.previewText(), amount, '薪资', '刷新后省略');

    // 编辑器/原简历始终保存原文
    const { useResumeStore } = await stores();
    const raw = useResumeStore.getState().resumes.find((r) => r.id === ID)!;
    expectStage(raw.summary.includes(amount), '原简历摘要', '仍保存原文');
  });
});

describe('E2E · 浏览器实际路径：出生日期带核验说明', () => {
  it('省略清理附着说明（成对/残缺括号都不残留），遮蔽保留说明，其他正文不动', async () => {
    const summary = '出生日期1990.05（已核验）。其余正常。';
    const resume = summaryOnlyResume(summary);
    const app = await launchApp(`/delivery/${ID}`, preload(resume));

    // 保留基线
    expectIncludes(app.previewText(), '1990.05', '出生日期', '保留基线');
    expectIncludes(app.previewText(), '已核验', '核验说明', '保留基线');

    // 遮蔽：日期变星号，但附着的核验说明保留（不被误删）
    await app.setBodyAction('birthDate', 'mask');
    let text = app.previewText();
    expectIncludes(text, '出生日期****-**-**（已核验）', '出生日期', '遮蔽保留说明');
    expectNotIncludes(text, '1990.05', '出生日期', '遮蔽');
    expectIncludes(text, '其余正常', '非敏感正文', '遮蔽');

    // 省略：日期 + 附着说明整段清理，无残缺/空括号、无原值、无星号
    await app.setBodyAction('birthDate', 'omit');
    text = app.previewText();
    expectIncludes(text, '其余正常。', '出生日期', '省略后正文衔接');
    expectNotIncludes(text, '1990.05', '出生日期', '省略');
    expectNotIncludes(text, '出生日期', '出生日期关键字', '省略');
    expectNotIncludes(text, '已核验', '附着说明', '省略应一并清理');
    expectNotIncludes(text, '（', '残缺括号', '省略不留左括号');
    expectNotIncludes(text, '）', '残缺括号', '省略不留右括号');
    expectNotIncludes(text, '****', '出生日期', '省略不留星号');
    expectNotIncludes(text, '。。', '悬空标点', '省略无叠句号');
    expectNotIncludes(text, '。其', '悬空标点', '省略不应残留句首句号');

    // 刷新重开仍省略
    const reopened = await relaunchAt(app, `/delivery/${ID}`);
    expect(reopened.getBodyAction('birthDate'), '[出生日期] 阶段「刷新重开」').toBe('省略');
    text = reopened.previewText();
    expectNotIncludes(text, '1990.05', '出生日期', '刷新后省略');
    expectNotIncludes(text, '（', '残缺括号', '刷新后无括号');

    // 编辑器/原简历仍保存原文
    const { useResumeStore } = await stores();
    const raw = useResumeStore.getState().resumes.find((r) => r.id === ID)!;
    expectStage(raw.summary.includes('1990.05') && raw.summary.includes('已核验'), '原简历摘要', '仍保存原文');
  });

  it('残缺左括号说明（未闭合）省略时也整体清理，不断裂括号', async () => {
    const summary = '核验信息：出生日期1990.05（已核验';
    const resume = summaryOnlyResume(summary);
    const app = await launchApp(`/delivery/${ID}`, preload(resume));
    await app.setBodyAction('birthDate', 'omit');
    const text = app.previewText();
    expectNotIncludes(text, '1990.05', '出生日期', '残缺括号省略');
    expectNotIncludes(text, '（', '残缺括号', '省略不留未闭合括号');
    expectNotIncludes(text, '已核验', '附着说明', '残缺括号说明一并清理');
    expectNotIncludes(text, '****', '出生日期', '省略不留星号');
    expectIncludes(text, '核验信息', '非敏感前缀', '残缺括号省略后保留');
  });
});
