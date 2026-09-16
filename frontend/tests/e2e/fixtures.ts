import type { Resume } from '../../src/types/resume';
import type { Profile } from '../../src/types/profile';
import { createDefaultPrivacyRules } from '../../src/types/privacy';

/** 一组覆盖摘要/工作/项目/教育、各含一种或多种敏感信息的测试正文。 */
export const SENSITIVE = {
  idNumber: '440106199205172222',
  idBare: '310105198811023216',
  salary: '30k',
  birthDate: '1990.05',
} as const;

export function richResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r_rich',
    title: '脱敏端到端简历',
    templateId: 'atelier',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    basicInfo: {
      fullName: '测试用户',
      headline: '产品经理',
      phone: '13812345678',
      email: 'tester@example.com',
      location: '上海市浦东新区',
      website: 'blog.example.com',
      avatarUrl: '',
    },
    summary: `8年产品经验，身份证号${SENSITIVE.idNumber}，期望薪资${SENSITIVE.salary}，出生日期${SENSITIVE.birthDate}，带过增长团队。`,
    sections: [
      { id: 'summary', title: '职业摘要', enabled: true },
      { id: 'work', title: '工作经历', enabled: true },
      { id: 'projects', title: '项目经历', enabled: true },
      { id: 'education', title: '教育经历', enabled: true },
    ],
    workExperiences: [
      {
        id: 'w1',
        companyName: '青松科技',
        position: '高级产品经理',
        startDate: '2021.06',
        endDate: '至今',
        // 行内命中
        responsibilities: [`负责增长，月薪 18000 元，13薪，带团队`],
        // 单独一行的纯敏感项（省略时整行被移除）
        achievements: [`期望薪资：25000元`, '转化率提升 32%'],
      },
    ],
    projects: [
      {
        id: 'p1',
        name: '增长平台',
        role: '负责人',
        startDate: '2023.11',
        endDate: '2024.08',
        techStack: ['React'],
        description: `生于1988-11-02，主导核心项目`,
        outcomes: [`年薪40万`, '按期交付上线'],
      },
    ],
    educations: [
      {
        id: 'e1',
        school: '某大学',
        major: '信息管理',
        level: 'bachelor' as never,
        startDate: '2013.09',
        endDate: '2017.06',
        gpa: '3.7/4.0',
        honors: [`身份证号${SENSITIVE.idNumber}`, '优秀毕业生'],
      },
    ],
    skills: [],
    ...overrides,
  };
}

/** 富简历里出现的全部敏感原值（省略后预览里一个都不能出现）。 */
export const SENSITIVE_VALUES = [
  SENSITIVE.idNumber,
  '18000',
  '25000',
  '40万',
  '1988-11-02',
  SENSITIVE.birthDate,
  '期望薪资',
  '月薪',
  '年薪',
  '身份证号',
  '生于',
  '出生日期',
  '****',
] as const;

/** 省略后必须保留的非敏感正文（证明只删命中、不连累其他内容）。 */
export const KEPT_TEXT = [
  '带过增长团队',
  '负责增长',
  '带团队',
  '转化率提升 32%',
  '主导核心项目',
  '按期交付上线',
  '优秀毕业生',
  '2021.06',
  '2013.09',
] as const;

/** 默认保护下的全局资料：与简历不同的一套联系方式，用于验证回退遮蔽/省略。 */
export function globalProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    fullName: '全局姓名',
    headline: '全局头衔',
    phone: '+86 139 0000 7788',
    email: 'global.user@corp.example',
    location: '北京市朝阳区建国路88号',
    website: 'https://home.example.com/global',
    avatarUrl: '',
    targetRole: '产品总监',
    summary: '全局摘要',
    ...overrides,
  };
}

export function storageWith(
  resumes: Resume[],
  profile: Profile | null,
  extra: Record<string, unknown> = {},
): () => void {
  return () => {
    localStorage.setItem('smart-resume:resumes', JSON.stringify(resumes));
    localStorage.setItem('smart-resume:activeResumeId', JSON.stringify(resumes[0]?.id ?? null));
    if (profile) {
      localStorage.setItem('smart-resume:profile', JSON.stringify(profile));
    }
    Object.entries(extra).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  };
}

/** 构造一个“旧备份”简历：没有 privacy 字段（恢复后应默认开启保护）。 */
export function oldBackupResume(): Resume {
  const r = richResume();
  delete (r as Partial<Resume>).privacy;
  return r;
}

/** 显式默认保护（与缺省等价，但字段齐全）。 */
export function resumeWithDefaultPrivacy(): Resume {
  return { ...richResume(), privacy: createDefaultPrivacyRules() };
}
