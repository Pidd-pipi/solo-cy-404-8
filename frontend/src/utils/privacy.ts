// 纯函数脱敏引擎。
// 关键约束：
// 1) 只读取原始简历 / 全局资料，返回全新的“遮蔽视图”，绝不修改入参、绝不回写 store；
// 2) 必须先解析“简历字段 → 全局资料”的回退，再套用规则，否则省略/清空简历字段会泄露全局值；
// 3) 幂等：遮蔽标记不含被识别字符（数字/字母/@），重复投影不会叠加遮蔽。
import { Profile } from '../types/profile';
import { BodyTextField, ContactField, contactFieldOrder, MaskAction, PrivacyRules, resolvePrivacyRules } from '../types/privacy';
import { Resume } from '../types/resume';

/** 遮蔽占位标记：刻意只使用非字母数字字符，保证不会被任何识别正则二次命中。 */
export const ID_MASK = '证件号********';
export const SALARY_MASK = '****';
export const BIRTHDATE_MASK = '****-**-**';
const GENERIC_MASK = '********';

const CONTACT_OMIT = '';

// ---------------------------------------------------------------------------
// 联系方式遮蔽（部分掩码，保留可辨识度）
// ---------------------------------------------------------------------------

/** 电话：保留国家码与号段首 3 位、尾 4 位，如 +86 138 **** 2831。 */
export function maskPhone(raw: string): string {
  const input = String(raw ?? '');
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }
  // 已有遮蔽标记直接原样返回（幂等）。
  if (trimmed.includes('****')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return '****';
  }
  let national = digits;
  let cc = '';
  if (digits.startsWith('00') && digits.length > 11) {
    // 00 86 138... 国际直拨写法
    cc = `+${digits.slice(2, -11)}`;
    national = digits.slice(-11);
  } else if (/^86(1[3-9]\d{9})$/.test(digits)) {
    // 86 138...（13 位）国内号码带国家码
    cc = '+86';
    national = digits.slice(2);
  } else if (digits.length > 11 && /^1[3-9]/.test(digits.slice(-11))) {
    // 其他国家码 + 国内 11 位手机号
    cc = `+${digits.slice(0, -11)}`;
    national = digits.slice(-11);
  }
  const head = national.slice(0, 3);
  const tail = national.slice(-4);
  return `${cc ? `${cc} ` : ''}${head} **** ${tail}`.replace(/\s+/g, ' ').trim();
}

/** 邮箱：保留首字符与域名，如 l******@example.com。 */
export function maskEmail(raw: string): string {
  const input = String(raw ?? '').trim();
  if (!input) {
    return '';
  }
  if (input.includes('******')) {
    return input;
  }
  const at = input.indexOf('@');
  if (at <= 0 || at === input.length - 1) {
    return '******';
  }
  const local = input.slice(0, at);
  const domain = input.slice(at + 1);
  return `${local.slice(0, 1)}******@${domain}`;
}

/** 地址：仅保留首个地域词，如 上海**** / 北京市****。 */
export function maskLocation(raw: string): string {
  const input = String(raw ?? '').trim();
  if (!input) {
    return '';
  }
  if (input.includes('****')) {
    return input;
  }
  const keepCount = input.length <= 3 ? 1 : 2;
  return `${input.slice(0, keepCount)}${'*'.repeat(4)}`;
}

/** 主页：保留主域名与后缀，隐藏子域标签与路径，如 ****.example.com/****。 */
export function maskWebsite(raw: string): string {
  const input = String(raw ?? '').trim();
  if (!input) {
    return '';
  }
  if (input.includes('****')) {
    return input;
  }
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  let host = input;
  let hadPath = false;
  try {
    const url = new URL(withScheme);
    host = url.hostname.replace(/^www\./i, '');
    hadPath = url.pathname.length > 1;
  } catch {
    const noScheme = input.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const slash = noScheme.indexOf('/');
    host = slash >= 0 ? noScheme.slice(0, slash) : noScheme;
    hadPath = slash >= 0 && slash < noScheme.length - 1;
  }
  const labels = host.split('.').filter(Boolean);
  let maskedHost: string;
  if (labels.length >= 3) {
    maskedHost = `****.${labels.slice(-2).join('.')}`;
  } else {
    maskedHost = labels.length === 2 ? `****.${labels.slice(-2).join('.')}` : '****';
  }
  return hadPath ? `${maskedHost}/****` : maskedHost;
}

/** 头像遮蔽：中性剪影 data URL；省略则返回空串，使 <img> 不渲染。 */
export function getMaskedAvatar(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">' +
    '<rect width="160" height="160" fill="#d8d2c4"/>' +
    '<circle cx="80" cy="62" r="30" fill="#9aa094"/>' +
    '<path d="M28 142c6-30 29-44 52-44s46 14 52 44z" fill="#9aa094"/>' +
    '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ---------------------------------------------------------------------------
// 正文自由文本识别（关键字锚定 + 幂等标记）
// ---------------------------------------------------------------------------

const PROVINCE_PREFIXES =
  '11|12|13|14|15|21|22|23|31|32|33|34|35|36|37|41|42|43|44|45|46|50|51|52|53|54|61|62|63|64|65|71|81|82';

// 1) 关键字锚定的证件号（身份证 15/18 位），允许中间出现 -、空格；要求数字边界，避免吞相邻数字。
//    关键字按“长词优先”排列，避免短词先命中（如“身份证号码”被“身份证”截断）。
const ID_ANCHORED =
  /(身份证号码|身份证号|身份证|证件号码|证件号|身份号码|身份号|ID(?:\s?Card)?(?:\s?No\.?|Number)?)([:：#\s-]{0,4})(?<![0-9])(\d{6}[- ]?\d{8}[- ]?\d{3}[\dXx]|\d{15})(?![0-9Xx])/gi;

// 2) 无关键字的裸 18 位身份证：必须同时满足省级地址码 + 合法出生年月日，显著降低误报。
const ID_BARE = new RegExp(
  `(?<![0-9Xx])((?:${PROVINCE_PREFIXES})\\d{4})(19|20)\\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\\d|3[01])\\d{3}[\\dXx](?![0-9Xx])`,
  'g',
);

// 薪资：关键字（长词优先）+ 可选分隔 + 金额区间或单值；区间两端单位均可消费，避免 30k-40k 残留 -40k。
const SALARY =
  /(期望薪资|税前薪资|税后薪资|薪资范围|月薪范围|年薪范围|offer\s?薪资|月薪|年薪|薪资|薪水|工资|薪酬|待遇|到手|报价)([:：#\s-]{0,4})(?<![0-9.])(\d{1,6}(?:\.\d+)?)\s*(?:万|千元|元|块|k|K|w|W)?(?:\s*[-~到至]\s*(\d{1,6}(?:\.\d+)?)\s*(?:万|千元|元|块|k|K|w|W)?)?(?:\/(?:月|年|小时|时|天))?(?:\s*\d{1,2}\s*薪)?/g;

// 出生日期：关键字（长词优先）+ 可选分隔 + 年/月/日（1990-01-02 / 1990年1月2日 / 1990.01 等）。
const BIRTH_DATE =
  /(出生年月日|出生日期|出生时间|Date\s?of\s?Birth|生于|出生|生日|DOB)([:：#\s-]{0,4})(?<![0-9])((?:19|20)\d{2})\s*[年\-.\/]\s*(\d{1,2})\s*(?:月\s*(\d{1,2})\s*日?|[.\-\/]\s*(\d{1,2}))?(?![0-9])/gi;

function applyMaskAction(text: string, action: MaskAction, replace: () => string): string {
  if (action === 'keep') {
    return text;
  }
  // 'mask' 与 'omit' 在自由文本里都按遮蔽处理（无法把正文整段移除）。
  return replace();
}

function maskIdNumber(text: string, action: MaskAction): string {
  return applyMaskAction(text, action, () => {
    // 关键字锚定：保留关键字本身，号码替换为纯星号标记（不重复“证件号”字样）。
    let next = text.replace(ID_ANCHORED, (_m, kw: string, sep: string) => `${kw}${sep}${GENERIC_MASK}`);
    // 无关键字的裸身份证：补一个语义标签，便于阅读。
    next = next.replace(ID_BARE, ID_MASK);
    return next;
  });
}

function maskSalary(text: string, action: MaskAction): string {
  return applyMaskAction(text, action, () =>
    text.replace(SALARY, (m, kw: string, sep: string) => `${kw}${sep}${SALARY_MASK}`),
  );
}

function maskBirthDate(text: string, action: MaskAction): string {
  return applyMaskAction(text, action, () =>
    text.replace(BIRTH_DATE, (m, kw: string, sep: string) => `${kw}${sep}${BIRTHDATE_MASK}`),
  );
}

/** 按顺序套用全部正文规则；每一步都只消费数字/日期字符，因此组合后仍幂等。 */
export function maskBodyText(text: string, body: Record<BodyTextField, MaskAction>): string {
  const source = String(text ?? '');
  if (!source) {
    return source;
  }
  let result = source;
  result = maskIdNumber(result, body.idNumber);
  result = maskSalary(result, body.salary);
  result = maskBirthDate(result, body.birthDate);
  return result;
}

// ---------------------------------------------------------------------------
// 遮蔽视图投影
// ---------------------------------------------------------------------------

export interface EffectiveContact {
  fullName: string;
  headline: string;
  phone: string;
  email: string;
  location: string;
  website: string;
  avatarUrl: string;
}

/** 解析联系方式的实际来源：简历字段优先，否则回退全局资料（唯一允许的回退点）。 */
export function resolveEffectiveContact(resume: Resume, profile: Profile): EffectiveContact {
  const b = resume.basicInfo;
  return {
    fullName: b.fullName || profile.fullName,
    headline: b.headline || profile.headline,
    phone: b.phone || profile.phone,
    email: b.email || profile.email,
    location: b.location || profile.location,
    website: b.website || profile.website,
    avatarUrl: b.avatarUrl || profile.avatarUrl,
  };
}

function maskContactValue(field: ContactField, value: string, action: MaskAction): string {
  if (action === 'keep') {
    return value;
  }
  if (action === 'omit') {
    return CONTACT_OMIT;
  }
  switch (field) {
    case 'phone':
      return maskPhone(value);
    case 'email':
      return maskEmail(value);
    case 'location':
      return maskLocation(value);
    case 'website':
      return maskWebsite(value);
    case 'avatar':
      return value ? getMaskedAvatar() : '';
    default:
      return value;
  }
}

function maskLines(lines: string[] | undefined, body: Record<BodyTextField, MaskAction>): string[] {
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.map((line) => maskBodyText(line, body));
}

/**
 * 生成仅供预览/导出使用的遮蔽简历视图。
 * - 总开关关闭时：仍解析全局回退（行为与原预览一致），但不做任何遮蔽；
 * - 开启时：先解析回退，再逐字段套用规则；字段为空 / 回退全局资料 / 规则缺省都不会泄露原值；
 * - 返回全新对象，原 resume 与 profile 不被修改，遮蔽结果也不会被写回任何 store。
 */
export function buildMaskedView(resume: Resume, profile: Profile, rawRules?: PrivacyRules | null): Resume {
  const rules = resolvePrivacyRules(rawRules ?? resume.privacy);
  // 唯一允许的回退点：简历字段优先，否则取全局资料。遮蔽在回退解析之后进行。
  const view: EffectiveContact = resolveEffectiveContact(resume, profile);

  if (rules.enabled) {
    contactFieldOrder.forEach((field) => {
      const key = field === 'avatar' ? 'avatarUrl' : field;
      view[key] = maskContactValue(field, view[key], rules.contacts[field]);
    });
  }

  const keepAllBody: Record<BodyTextField, MaskAction> = { idNumber: 'keep', salary: 'keep', birthDate: 'keep' };
  const body: Record<BodyTextField, MaskAction> = rules.enabled ? rules.body : keepAllBody;
  const rawSummary = resume.summary || profile.summary;

  return {
    ...resume,
    basicInfo: {
      fullName: view.fullName,
      headline: view.headline,
      phone: view.phone,
      email: view.email,
      location: view.location,
      website: view.website,
      avatarUrl: view.avatarUrl,
    },
    summary: maskBodyText(rawSummary, body),
    workExperiences: resume.workExperiences.map((item) => ({
      ...item,
      position: maskBodyText(item.position, body),
      companyName: maskBodyText(item.companyName, body),
      responsibilities: maskLines(item.responsibilities, body),
      achievements: maskLines(item.achievements, body),
    })),
    projects: resume.projects.map((project) => ({
      ...project,
      name: maskBodyText(project.name, body),
      role: maskBodyText(project.role, body),
      description: maskBodyText(project.description, body),
      outcomes: maskLines(project.outcomes, body),
    })),
    educations: resume.educations.map((education) => ({
      ...education,
      school: maskBodyText(education.school, body),
      major: maskBodyText(education.major, body),
      honors: maskLines(education.honors, body),
    })),
    skills: resume.skills.map((skill) => ({ ...skill, name: maskBodyText(skill.name, body) })),
  };
}
