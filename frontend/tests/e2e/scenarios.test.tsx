import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { launchApp, relaunchAt, stores } from './harness';
import { expectIncludes, expectNotIncludes, expectStage } from './assert';
import { richResume, globalProfile, storageWith, oldBackupResume, SENSITIVE } from './fixtures';
import { createDefaultPrivacyRules } from '../../src/types/privacy';

const ID = 'r_rich';

describe('E2E · 全局资料回退：简历字段为空时也不能泄露', () => {
  it('联系方式与正文回退全局资料：默认遮蔽、可省略、保留才显示', async () => {
    const PROFILE_PHONE = '+86 139 0000 7788';
    const PROFILE_EMAIL = 'global.user@corp.example';
    const PROFILE_LOCATION = '北京市朝阳区建国路88号';
    const PROFILE_WEBSITE = 'https://home.example.com/global';
    const AVATAR_TAG = 'PROFILESECRETAGATAR';
    const profile = globalProfile({
      phone: PROFILE_PHONE,
      email: PROFILE_EMAIL,
      location: PROFILE_LOCATION,
      website: PROFILE_WEBSITE,
      avatarUrl: `data:image/png;base64,${AVATAR_TAG}`,
      summary: `全局资料摘要，身份证号${SENSITIVE.idNumber}，期望薪资30k。`,
    });
    // 简历联系方式与摘要全部留空 → 全部回退到全局资料
    const resume = richResume({
      basicInfo: { fullName: '', headline: '', phone: '', email: '', location: '', website: '', avatarUrl: '' },
      summary: '',
      privacy: createDefaultPrivacyRules(),
    });
    const app = await launchApp(`/delivery/${ID}`, storageWith([resume], profile));

    let text = app.previewText();
    // 默认遮蔽：全局值不泄露，仅保留可辨识首尾 / 星号
    expectNotIncludes(text, PROFILE_PHONE, '电话(全局回退)', '默认遮蔽');
    expectNotIncludes(text, '0000', '电话(全局回退)', '默认遮蔽');
    expectNotIncludes(text, 'global.user', '邮箱(全局回退)', '默认遮蔽');
    expectNotIncludes(text, '朝阳', '地址(全局回退)', '默认遮蔽');
    expectNotIncludes(text, '/global', '主页(全局回退)', '默认遮蔽');
    expectIncludes(text, '****', '遮蔽标记', '默认遮蔽');
    // 全局头像被中性占位替换
    const avatar = app.previewAvatarSrc();
    expectStage(avatar?.startsWith('data:image/svg+xml'), '头像(全局回退)', '默认遮蔽换占位', avatar ?? 'null');
    expectStage(!avatar?.includes(AVATAR_TAG), '头像(全局回退)', '不得泄露全局头像数据');
    // 回退的全局摘要同样被正文规则处理
    expectIncludes(text, '身份证号********', '正文(全局摘要回退)', '默认遮蔽');
    expectIncludes(text, '期望薪资****', '正文(全局摘要回退)', '默认遮蔽');
    expectNotIncludes(text, SENSITIVE.idNumber, '正文(全局摘要回退)', '默认遮蔽');

    // 联系方式设为省略：即便来自全局资料也整项不出现
    await app.setContactAction('电话', 'omit');
    await app.setContactAction('邮箱', 'omit');
    text = app.previewText();
    expectNotIncludes(text, PROFILE_PHONE, '电话(全局回退)', '省略');
    expectNotIncludes(text, '7788', '电话(全局回退)', '省略');
    expectNotIncludes(text, PROFILE_EMAIL, '邮箱(全局回退)', '省略');
    expectNotIncludes(text, 'corp.example', '邮箱(全局回退)', '省略');

    // 仅电话切回保留：显示全局电话，而邮箱仍省略
    await app.setContactAction('电话', 'keep');
    text = app.previewText();
    expectIncludes(text, PROFILE_PHONE, '电话(全局回退)', '显式保留才显示');
    expectNotIncludes(text, PROFILE_EMAIL, '邮箱(全局回退)', '仍省略');
  });
});

describe('E2E · 关闭模块（总开关）', () => {
  it('关闭后预览/导出恢复明文并在刷新后保持；重新开启再遮蔽', async () => {
    const resume = richResume({ privacy: createDefaultPrivacyRules() });
    const app = await launchApp(`/delivery/${ID}`, storageWith([resume], globalProfile()));

    expectStage(app.isProtectionEnabled(), '总开关', '默认开启');
    let text = app.previewText();
    expectNotIncludes(text, '13812345678', '电话', '开启时遮蔽');
    expectNotIncludes(text, SENSITIVE.idNumber, '证件号', '开启时遮蔽');

    await app.setProtectionEnabled(false);
    expectStage(!app.isProtectionEnabled(), '总开关', '已关闭');
    text = app.previewText();
    expectIncludes(text, '13812345678', '电话', '关闭后明文');
    expectIncludes(text, 'tester@example.com', '邮箱', '关闭后明文');
    expectIncludes(text, SENSITIVE.idNumber, '证件号', '关闭后明文');
    expectIncludes(text, '30k', '薪资', '关闭后明文');
    expectStage(!text.includes('****'), '遮蔽标记', '关闭后不应出现');

    // 刷新重开：开关仍关闭、仍明文（规则不被重置）
    const reopened = await relaunchAt(app, `/delivery/${ID}`);
    expectStage(!reopened.isProtectionEnabled(), '总开关', '刷新后仍关闭');
    expectIncludes(reopened.previewText(), '13812345678', '电话', '刷新后仍明文');

    // 重新开启：再次遮蔽
    await reopened.setProtectionEnabled(true);
    expectStage(reopened.isProtectionEnabled(), '总开关', '重新开启');
    expectNotIncludes(reopened.previewText(), '13812345678', '电话', '重新开启后遮蔽');
  });
});

describe('E2E · 复制简历：规则各自独立', () => {
  it('副本继承规则，之后修改任一方互不影响（通过列表复制 UI）', async () => {
    const source = richResume({
      id: 'r_src',
      title: '源简历',
      privacy: {
        enabled: true,
        contacts: { phone: 'omit', email: 'keep', location: 'keep', avatar: 'keep', website: 'keep' },
        body: { idNumber: 'omit', salary: 'keep', birthDate: 'keep' },
      },
    });
    const app = await launchApp('/resumes', storageWith([source], globalProfile()));

    // 在简历列表点第一张卡片的 kebab → 复制（走真实 duplicateResume）
    const firstCard = document.querySelector('article');
    expectStage(!!firstCard, '复制入口', '找到简历卡片');
    const kebab = firstCard!.querySelector('button');
    expectStage(!!kebab, '复制入口', '找到 kebab 按钮');
    await act(async () => {
      kebab!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await act(async () => {});
    const duplicateItem = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '复制');
    expectStage(!!duplicateItem, '复制入口', '菜单展开且出现「复制」');
    await act(async () => {
      duplicateItem!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    await act(async () => {});

    const { useResumeStore } = await stores();
    const clone = useResumeStore.getState().resumes.find((r) => r.title === '源简历 副本');
    expectStage(!!clone, '复制', '生成「副本」简历');
    const cloneId = clone!.id;
    expectStage(cloneId !== 'r_src', '复制', '副本使用新 id');

    // 副本继承规则
    await app.goto(`/delivery/${cloneId}`);
    expect(app.getContactAction('电话'), '[电话] 副本应继承省略').toBe('省略');
    expect(app.getBodyAction('idNumber'), '[证件号] 副本应继承省略').toBe('省略');

    // 只改副本：电话→保留，证件号→遮蔽
    await app.setContactAction('电话', 'keep');
    await app.setBodyAction('idNumber', 'mask');

    // 源简历规则不受影响
    await app.goto('/delivery/r_src');
    expect(app.getContactAction('电话'), '[电话] 源应仍省略（副本改动不影响源）').toBe('省略');
    expect(app.getBodyAction('idNumber'), '[证件号] 源应仍省略（副本改动不影响源）').toBe('省略');
    expectNotIncludes(app.previewText(), '13812345678', '电话(源)', '源仍省略不泄露');

    // 再改源，副本不受影响
    await app.setContactAction('电话', 'mask');
    await app.goto(`/delivery/${cloneId}`);
    expect(app.getContactAction('电话'), '[电话] 副本应仍为保留（源改动不影响副本）').toBe('保留');
    expect(app.getBodyAction('idNumber'), '[证件号] 副本应仍为遮蔽').toBe('遮蔽');
    expectIncludes(app.previewText(), '13812345678', '电话(副本)', '副本保留显示真实值');
  });
});

describe('E2E · 旧备份恢复：缺省 privacy 默认保护', () => {
  it('没有 privacy 字段的旧备份打开即默认遮蔽，且能正常编辑', async () => {
    const old = oldBackupResume();
    expectStage(!('privacy' in old) || old.privacy === undefined, '旧备份', '确认无 privacy 字段');
    const app = await launchApp(`/delivery/${ID}`, storageWith([old], globalProfile()));

    expectStage(app.isProtectionEnabled(), '总开关', '旧备份默认开启');
    expect(app.getContactAction('电话'), '[电话] 旧备份默认遮蔽').toBe('遮蔽');
    expect(app.getContactAction('邮箱'), '[邮箱] 旧备份默认遮蔽').toBe('遮蔽');
    expect(app.getBodyAction('idNumber'), '[证件号] 旧备份默认遮蔽').toBe('遮蔽');
    expect(app.getBodyAction('salary'), '[薪资] 旧备份默认遮蔽').toBe('遮蔽');
    expect(app.getBodyAction('birthDate'), '[出生日期] 旧备份默认遮蔽').toBe('遮蔽');

    const text = app.previewText();
    expectNotIncludes(text, '13812345678', '电话', '旧备份默认遮蔽');
    expectNotIncludes(text, SENSITIVE.idNumber, '证件号', '旧备份默认遮蔽');
    expectIncludes(text, '****', '遮蔽标记', '旧备份默认遮蔽');

    // 旧备份可正常编辑：把电话改为省略后立即生效
    await app.setContactAction('电话', 'omit');
    expect(app.getContactAction('电话'), '[电话] 旧备份编辑后为省略').toBe('省略');
    expectNotIncludes(app.previewText(), '5678', '电话', '旧备份省略生效');
  });
});
