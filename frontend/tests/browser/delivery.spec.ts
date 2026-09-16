import { expect, test, type Page } from '@playwright/test';

/**
 * 真实浏览器端到端：直接驱动 Vite + 真实页面/路由/store/localStorage。
 * 每个用例用全新浏览器上下文（localStorage 隔离），并用步骤（step）标注“阶段”，
 * 失败信息统一带上字段与阶段（expectField*），不靠放宽断言或替身掩盖问题。
 */

const MASK = '****';

// 字段 + 阶段 的强断言：失败时直接指出是哪个字段、在什么阶段、泄露/缺失了什么。
function expectIncludes(haystack: string, needle: string, field: string, stage: string) {
  expect(haystack.includes(needle), `[${field}] 阶段「${stage}」应包含 ${JSON.stringify(needle)}；实际：${JSON.stringify(haystack.slice(0, 200))}`).toBe(true);
}
function expectNotIncludes(haystack: string, needle: string, field: string, stage: string) {
  expect(haystack.includes(needle), `[${field}] 阶段「${stage}」发生泄露/残留，仍包含 ${JSON.stringify(needle)}；实际：${JSON.stringify(haystack.slice(0, 200))}`).toBe(false);
}
function expectCleanPunctuation(text: string, field: string, stage: string) {
  for (const bad of ['，，', '。。', '，。', '（）', '()']) {
    expect(text.includes(bad), `[${field}] 阶段「${stage}」出现悬空/残缺标点 ${JSON.stringify(bad)}；实际：${JSON.stringify(text.slice(0, 200))}`).toBe(false);
  }
}

async function summaryText(page: Page): Promise<string> {
  const summaryP = page
    .locator('article section')
    .filter({ has: page.locator('h2').filter({ hasText: '职业摘要' }) })
    .locator('p')
    .first();
  await expect(summaryP).toBeVisible();
  return (await summaryP.innerText()).replace(/\s+/g, ' ').trim();
}

/** 在脱敏投递台把某个正文字段切到 保留/遮蔽/省略（分段控件，真实点击）。 */
async function setBodyAction(page: Page, label: string, action: string) {
  const group = page.locator(`[aria-label="${label}处理方式"]`);
  await group.locator('button', { hasText: new RegExp(`^${action}$`) }).click();
}
async function getBodyAction(page: Page, label: string): Promise<string> {
  return page.locator(`[aria-label="${label}处理方式"] button[aria-pressed="true"]`).innerText();
}

/** 打开列表中第一份简历的编辑器，写入职业摘要，返回浏览器地址栏里的简历 id。 */
async function editFirstResumeSummary(page: Page, summary: string): Promise<string> {
  await test.step('阶段：新建/打开第一份简历编辑器', async () => {
    await page.goto('/resumes');
    await expect(page.getByRole('heading', { name: '简历列表' })).toBeVisible();
    await page.locator('article').first().getByRole('link', { name: '编辑' }).click();
    await expect(page).toHaveURL(/\/resumes\/[^/]+\/edit/);
    await expect(page.getByLabel('职业摘要正文')).toBeVisible();
  });
  // URL 形如 /resumes/:id/edit —— 取倒数第二段（真实简历 id）。
  const id = page.url().split('/').filter(Boolean).slice(-2)[0]!;
  await test.step('阶段：在编辑器输入职业摘要原文（编辑器必须保存原文）', async () => {
    const ta = page.getByLabel('职业摘要正文');
    await ta.fill(summary);
    await ta.blur();
  });
  return id;
}

/**
 * 在列表复制第一份（唯一）简历，真实走 kebab→复制。
 * 复制后页面停留在列表（不跳转），因此从副本卡片的投递链接读取副本 id，并同时返回源 id。
 */
async function duplicateFirstResume(page: Page): Promise<{ sourceId: string; cloneId: string }> {
  await page.goto('/resumes');
  const onlyCard = page.locator('article').first();
  const sourceId = (await onlyCard.locator('a[href^="/delivery/"]').getAttribute('href'))!.split('/').pop()!;

  await onlyCard.locator('button').last().click(); // kebab
  await page.getByRole('menuitem', { name: '复制' }).click();

  // 副本卡片出现（标题含“副本”），从其投递链接取 id。
  const cloneCard = page.locator('article', { hasText: '副本' }).first();
  await expect(cloneCard).toBeVisible();
  const cloneId = (await cloneCard.locator('a[href^="/delivery/"]').getAttribute('href'))!.split('/').pop()!;
  return { sourceId, cloneId };
}


test.describe('真实浏览器 · 脱敏投递台', () => {
  test('薪资中文数字金额：期望薪资一万八千元 三态、刷新重开、原文保存', async ({ page }) => {
    const amount = '一万八千元';
    const summary = `可入职，期望薪资${amount}，谢谢。`;
    const id = await editFirstResumeSummary(page, summary);
    await page.goto(`/delivery/${id}`);
    await expect(page.getByRole('heading', { name: '脱敏投递台' })).toBeVisible();

    await test.step('阶段：保留基线（默认保护下薪资字段若已遮蔽先切保留）', async () => {
      // 旧 seed 默认保护：先显式切到“保留”建立明文基线。
      await setBodyAction(page, '薪资', '保留');
      const t = await summaryText(page);
      expectIncludes(t, `期望薪资${amount}`, '薪资', '保留基线');
    });

    await test.step('阶段：遮蔽', async () => {
      await setBodyAction(page, '薪资', '遮蔽');
      expect(await getBodyAction(page, '薪资')).toBe('遮蔽');
      const t = await summaryText(page);
      expectIncludes(t, '期望薪资****', '薪资', '遮蔽');
      expectNotIncludes(t, amount, '薪资', '遮蔽');
    });

    await test.step('阶段：省略（不留原值/星号/悬空标点）', async () => {
      await setBodyAction(page, '薪资', '省略');
      expect(await getBodyAction(page, '薪资')).toBe('省略');
      const t = await summaryText(page);
      expectIncludes(t, '可入职，谢谢。', '薪资', '省略衔接');
      expectNotIncludes(t, amount, '薪资', '省略');
      expectNotIncludes(t, '期望薪资', '薪资关键字', '省略');
      expectNotIncludes(t, MASK, '薪资', '省略不留星号');
      expectCleanPunctuation(t, '薪资', '省略');
    });

    await test.step('阶段：刷新重开仍省略', async () => {
      await page.reload();
      await expect(page.getByRole('heading', { name: '脱敏投递台' })).toBeVisible();
      expect(await getBodyAction(page, '薪资')).toBe('省略');
      const t = await summaryText(page);
      expectIncludes(t, '可入职，谢谢。', '薪资', '刷新后省略');
      expectNotIncludes(t, amount, '薪资', '刷新后省略');
    });

    await test.step('阶段：编辑器仍保存原文', async () => {
      await page.goto(`/resumes/${id}/edit`);
      await expect(page.getByLabel('职业摘要正文')).toHaveValue(summary);
    });
  });

  test('薪资中文数字金额：期望薪资两万五千元 三态与刷新重开', async ({ page }) => {
    const amount = '两万五千元';
    const summary = `期望薪资${amount}，可面议。`;
    const id = await editFirstResumeSummary(page, summary);
    await page.goto(`/delivery/${id}`);

    await setBodyAction(page, '薪资', '保留');
    let t = await summaryText(page);
    expectIncludes(t, `期望薪资${amount}`, '薪资', '保留基线');

    await setBodyAction(page, '薪资', '遮蔽');
    t = await summaryText(page);
    expectIncludes(t, '期望薪资****，可面议。', '薪资', '遮蔽');
    expectNotIncludes(t, amount, '薪资', '遮蔽');

    await setBodyAction(page, '薪资', '省略');
    t = await summaryText(page);
    expectIncludes(t, '可面议。', '薪资', '省略衔接');
    expectNotIncludes(t, amount, '薪资', '省略');
    expectNotIncludes(t, MASK, '薪资', '省略');
    expectCleanPunctuation(t, '薪资', '省略');

    await page.reload();
    expect(await getBodyAction(page, '薪资')).toBe('省略');
    t = await summaryText(page);
    expectIncludes(t, '可面议。', '薪资', '刷新后省略');

    await page.goto(`/resumes/${id}/edit`);
    await expect(page.getByLabel('职业摘要正文')).toHaveValue(summary);
  });

  test('出生日期附着核验说明：省略清理说明与括号，遮蔽保留说明，刷新重开', async ({ page }) => {
    const summary = '出生日期1990.05（已核验）。其余正常。';
    const id = await editFirstResumeSummary(page, summary);
    await page.goto(`/delivery/${id}`);

    await test.step('阶段：保留基线', async () => {
      await setBodyAction(page, '出生日期', '保留');
      const t = await summaryText(page);
      expectIncludes(t, '1990.05', '出生日期', '保留基线');
      expectIncludes(t, '已核验', '附着说明', '保留基线');
    });

    await test.step('阶段：遮蔽保留附着说明', async () => {
      await setBodyAction(page, '出生日期', '遮蔽');
      const t = await summaryText(page);
      expectIncludes(t, '出生日期****-**-**（已核验）', '出生日期', '遮蔽保留说明');
      expectNotIncludes(t, '1990.05', '出生日期', '遮蔽');
      expectIncludes(t, '其余正常', '其他正文', '遮蔽');
    });

    await test.step('阶段：省略整段（含附着说明/括号）清理', async () => {
      await setBodyAction(page, '出生日期', '省略');
      expect(await getBodyAction(page, '出生日期')).toBe('省略');
      const t = await summaryText(page);
      expectIncludes(t, '其余正常。', '出生日期', '省略衔接');
      expectNotIncludes(t, '1990.05', '出生日期', '省略');
      expectNotIncludes(t, '出生日期', '出生日期关键字', '省略');
      expectNotIncludes(t, '已核验', '附着说明', '省略应清理');
      expectNotIncludes(t, '（', '残缺括号', '省略不留左括号');
      expectNotIncludes(t, '）', '残缺括号', '省略不留右括号');
      expectNotIncludes(t, MASK, '出生日期', '省略不留星号');
      expectCleanPunctuation(t, '出生日期', '省略');
    });

    await test.step('阶段：刷新重开仍省略', async () => {
      await page.reload();
      expect(await getBodyAction(page, '出生日期')).toBe('省略');
      const t = await summaryText(page);
      expectNotIncludes(t, '1990.05', '出生日期', '刷新后省略');
      expectNotIncludes(t, '（', '残缺括号', '刷新后无括号');
      expectIncludes(t, '其余正常。', '出生日期', '刷新后省略');
    });

    await test.step('阶段：编辑器仍保存原文', async () => {
      await page.goto(`/resumes/${id}/edit`);
      await expect(page.getByLabel('职业摘要正文')).toHaveValue(summary);
    });
  });

  test('复制隔离：副本继承规则，副本与源简历改规则互不影响', async ({ page }) => {
    // 源为内置简历（无显式规则 → 默认保护：各类遮蔽）；复制入口真实走列表 kebab→复制。
    const { sourceId, cloneId } = await duplicateFirstResume(page);

    await test.step('阶段：副本继承源规则（默认遮蔽）', async () => {
      await page.goto(`/delivery/${cloneId}`);
      expect(await getBodyAction(page, '证件号')).toBe('遮蔽');
      expect(await getBodyAction(page, '薪资')).toBe('遮蔽');
    });

    await test.step('阶段：只改副本为“电话省略、证件号保留”，源不受影响', async () => {
      await page.locator('[aria-label="电话处理方式"]').getByRole('button', { name: '省略' }).click();
      await setBodyAction(page, '证件号', '保留');

      await page.goto(`/delivery/${sourceId}`);
      expect(await page.locator('[aria-label="电话处理方式"] button[aria-pressed="true"]').innerText()).toBe('遮蔽');
      expect(await getBodyAction(page, '证件号')).toBe('遮蔽');
    });

    await test.step('阶段：只改源为“电话保留、薪资省略”，副本不受影响', async () => {
      await page.locator('[aria-label="电话处理方式"]').getByRole('button', { name: '保留' }).click();
      await setBodyAction(page, '薪资', '省略');

      await page.goto(`/delivery/${cloneId}`);
      expect(await page.locator('[aria-label="电话处理方式"] button[aria-pressed="true"]').innerText()).toBe('省略');
      expect(await getBodyAction(page, '证件号')).toBe('保留');
      expect(await getBodyAction(page, '薪资')).toBe('遮蔽');
    });

    await test.step('阶段：刷新后双向隔离仍成立', async () => {
      await page.reload();
      expect(await page.locator('[aria-label="电话处理方式"] button[aria-pressed="true"]').innerText()).toBe('省略');
      await page.goto(`/delivery/${sourceId}`);
      expect(await page.locator('[aria-label="电话处理方式"] button[aria-pressed="true"]').innerText()).toBe('保留');
      expect(await getBodyAction(page, '薪资')).toBe('省略');
    });
  });
});
