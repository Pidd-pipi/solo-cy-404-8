import { describe, it, expect } from 'vitest';
import { launchApp } from './harness';
import { expectIncludes, expectNotIncludes } from './assert';
import { richResume } from './fixtures';
import { PrivacyRules } from '../../src/types/privacy';
import { Resume } from '../../src/types/resume';

const ID = 'r_rich';

interface Phrasing {
  name: string;
  phrase: string;
  /** 遮蔽后应出现的片段（关键字/说明词保留，数字换成星号）。 */
  maskedPhrase: string;
  /** 省略/遮蔽后绝不能残留的原值片段。 */
  secret: string[];
}

// 覆盖：紧邻、冒号、说明词（括号/为/约）、区间、元/千元/万、13薪与十三薪。
const PHRASINGS: Phrasing[] = [
  { name: '金额紧邻关键词', phrase: '期望薪资25k', maskedPhrase: '期望薪资****', secret: ['25k', '25'] },
  { name: '冒号+元', phrase: '期望薪资：25000元', maskedPhrase: '期望薪资：****', secret: ['25000'] },
  { name: '括号说明词（税前）', phrase: '期望薪资（税前）25k', maskedPhrase: '期望薪资（税前）****', secret: ['25k', '25'] },
  { name: '文字说明词 为税前', phrase: '期望薪资为税前25k', maskedPhrase: '期望薪资为税前****', secret: ['25k', '25'] },
  { name: '约数说明词', phrase: '期望薪资约25000元', maskedPhrase: '期望薪资约****', secret: ['25000'] },
  { name: '区间 30k-40k', phrase: '薪资范围 30k-40k', maskedPhrase: '薪资范围 ****', secret: ['30k', '40k', '30', '40'] },
  { name: '千元单位', phrase: '月薪25千元', maskedPhrase: '月薪****', secret: ['25千元', '25'] },
  { name: '万单位', phrase: '年薪40万', maskedPhrase: '年薪****', secret: ['40万', '40'] },
  { name: '13薪', phrase: '月薪 18000 元，13薪', maskedPhrase: '月薪 ****', secret: ['18000', '13薪'] },
  { name: '十三薪（中文）', phrase: '期望薪资：25k，十三薪', maskedPhrase: '期望薪资：****', secret: ['25k', '十三薪'] },
];

function resumeWithSummary(summary: string, salaryAction: 'keep' | 'mask' | 'omit'): Resume {
  const body: PrivacyRules['body'] = { idNumber: 'keep', salary: salaryAction, birthDate: 'keep' };
  return richResume({
    summary,
    // 其余模块清空，避免其它字段干扰薪资断言。
    workExperiences: [],
    projects: [],
    educations: [],
    sections: [{ id: 'summary', title: '职业摘要', enabled: true }],
    privacy: {
      enabled: true,
      contacts: { phone: 'keep', email: 'keep', location: 'keep', avatar: 'keep', website: 'keep' },
      body,
    },
  });
}

const PRE = '前置说明，';
const POST = '，后置说明。';

describe.each(PHRASINGS)('E2E · 薪资写法：$name', ({ name, phrase, maskedPhrase, secret }) => {
  it('保留→遮蔽→省略 三态正确，省略无原值/星号/悬空标点', async () => {
    const summary = `${PRE}${phrase}${POST}`;
    const preload = (action: 'keep' | 'mask' | 'omit') => () => {
      localStorage.setItem('smart-resume:resumes', JSON.stringify([resumeWithSummary(summary, action)]));
      localStorage.setItem('smart-resume:activeResumeId', JSON.stringify(ID));
    };

    // 初始 keep：原值可见（基线）
    let app = await launchApp(`/delivery/${ID}`, preload('keep'));
    let text = app.previewText();
    expectIncludes(text, phrase, '薪资', `${name}/保留基线`);

    // 切到遮蔽：关键字/说明词保留、数字消失、出现固定星号
    await app.setBodyAction('salary', 'mask');
    expect(app.getBodyAction('salary'), `[薪资] ${name}/遮蔽 选中态`).toBe('遮蔽');
    text = app.previewText();
    expectIncludes(text, maskedPhrase, '薪资', `${name}/遮蔽`);
    for (const s of secret) {
      expectNotIncludes(text, s, '薪资', `${name}/遮蔽`);
    }
    expectStageCount(text, 1);

    // 切到省略：整段（含关键字与说明词）移除，前后文干净衔接
    await app.setBodyAction('salary', 'omit');
    expect(app.getBodyAction('salary'), `[薪资] ${name}/省略 选中态`).toBe('省略');
    text = app.previewText();
    expectIncludes(text, '前置说明，后置说明。', '薪资', `${name}/省略衔接`);
    for (const s of secret) {
      expectNotIncludes(text, s, '薪资', `${name}/省略`);
    }
    expectNotIncludes(text, '****', '薪资', `${name}/省略不留星号`);
    expectNotIncludes(text, '，，', '薪资', `${name}/省略无悬空标点`);
    expectNotIncludes(text, '，。', '薪资', `${name}/省略无悬空标点`);
  });
});

function expectStageCount(text: string, expectedMaskBlocks: number) {
  expect((text.match(/\*{4}/g) || []).length, `星号块数量应为 ${expectedMaskBlocks}；实际：${JSON.stringify(text.slice(0, 160))}`).toBe(
    expectedMaskBlocks,
  );
}
