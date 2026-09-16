// 简历脱敏规则：按简历独立持久化，仅作用于预览与导出，不回写原简历或全局资料。

/** 联系方式 / 头像 / 主页的处理方式：保留、遮蔽、省略（不展示该行）。 */
export type MaskAction = 'keep' | 'mask' | 'omit';

/** 联系方式字段（对应简历基本信息与全局资料的同名字段）。 */
export type ContactField = 'phone' | 'email' | 'location' | 'avatar' | 'website';

/** 正文自由文本中需要识别的敏感信息。仅支持 保留 / 遮蔽（省略等价于遮蔽，正文无法整段移除）。 */
export type BodyTextField = 'idNumber' | 'salary' | 'birthDate';

export interface PrivacyRules {
  /** 脱敏总开关。关闭后预览/导出与现状一致；规则仍按简历保留，不会被重置。 */
  enabled: boolean;
  contacts: Record<ContactField, MaskAction>;
  body: Record<BodyTextField, MaskAction>;
}

export const maskActionLabels: Record<MaskAction, string> = {
  keep: '保留',
  mask: '遮蔽',
  omit: '省略',
};

export const contactFieldLabels: Record<ContactField, string> = {
  phone: '电话',
  email: '邮箱',
  location: '地址',
  avatar: '头像',
  website: '主页',
};

export const bodyFieldLabels: Record<BodyTextField, string> = {
  idNumber: '证件号',
  salary: '薪资',
  birthDate: '出生日期',
};

export const contactFieldOrder: ContactField[] = ['phone', 'email', 'location', 'avatar', 'website'];
export const bodyFieldOrder: BodyTextField[] = ['idNumber', 'salary', 'birthDate'];

/**
 * 默认即开启保护：新建简历、以及从没有 privacy 字段的旧备份恢复时，
 * 联系方式与头像默认遮蔽，正文三类敏感信息默认识别并遮蔽。
 */
export function createDefaultPrivacyRules(): PrivacyRules {
  return {
    enabled: true,
    contacts: {
      phone: 'mask',
      email: 'mask',
      location: 'mask',
      avatar: 'mask',
      website: 'mask',
    },
    body: {
      idNumber: 'mask',
      salary: 'mask',
      birthDate: 'mask',
    },
  };
}

/** 全部保留并关闭总开关（“暂不脱敏”预设）。 */
export function createOpenPrivacyRules(): PrivacyRules {
  return {
    enabled: false,
    contacts: { phone: 'keep', email: 'keep', location: 'keep', avatar: 'keep', website: 'keep' },
    body: { idNumber: 'keep', salary: 'keep', birthDate: 'keep' },
  };
}

/** 严格投递：联系方式与正文全部遮蔽，头像省略。 */
export function createStrictPrivacyRules(): PrivacyRules {
  return {
    enabled: true,
    contacts: { phone: 'mask', email: 'mask', location: 'mask', avatar: 'omit', website: 'mask' },
    body: { idNumber: 'mask', salary: 'mask', birthDate: 'mask' },
  };
}

function isMaskAction(value: unknown): value is MaskAction {
  return value === 'keep' || value === 'mask' || value === 'omit';
}

/**
 * 防御性读取：旧备份 / 历史简历没有 privacy 字段，或字段被裁剪时，
 * 逐字段回退到默认保护，保证“旧备份恢复后仍能打开”且默认不泄露。
 * 永远返回全新对象，不与入参共享引用。
 */
export function resolvePrivacyRules(input?: Partial<PrivacyRules> | null): PrivacyRules {
  const defaults = createDefaultPrivacyRules();
  if (!input || typeof input !== 'object') {
    return defaults;
  }

  const contactsInput = input.contacts as Partial<Record<ContactField, unknown>> | undefined;
  const bodyInput = input.body as Partial<Record<BodyTextField, unknown>> | undefined;
  const contacts = { ...defaults.contacts };
  const body = { ...defaults.body };

  if (contactsInput && typeof contactsInput === 'object') {
    (Object.keys(contacts) as ContactField[]).forEach((field) => {
      if (isMaskAction(contactsInput[field])) {
        contacts[field] = contactsInput[field] as MaskAction;
      }
    });
  }
  if (bodyInput && typeof bodyInput === 'object') {
    (Object.keys(body) as BodyTextField[]).forEach((field) => {
      if (isMaskAction(bodyInput[field])) {
        body[field] = bodyInput[field] as MaskAction;
      }
    });
  }

  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : defaults.enabled,
    contacts,
    body,
  };
}

/** 深拷贝规则，确保“复制简历后规则各自独立”。 */
export function clonePrivacyRules(rules: PrivacyRules): PrivacyRules {
  return {
    enabled: rules.enabled,
    contacts: { ...rules.contacts },
    body: { ...rules.body },
  };
}
