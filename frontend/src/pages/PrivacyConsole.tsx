import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, EyeOff, FileWarning, ShieldCheck, Sparkles } from 'lucide-react';
import { Switch } from '@headlessui/react';
import { ActionSegmented } from '../components/common/ActionSegmented';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { ResumePreview } from '../components/preview/ResumePreview';
import { useProfileStore } from '../stores/profile';
import { useResumeStore } from '../stores/resume';
import {
  BodyTextField,
  bodyFieldLabels,
  bodyFieldOrder,
  ContactField,
  contactFieldLabels,
  contactFieldOrder,
  createDefaultPrivacyRules,
  createOpenPrivacyRules,
  createStrictPrivacyRules,
  MaskAction,
  PrivacyRules,
  resolvePrivacyRules,
} from '../types/privacy';
import { Resume } from '../types/resume';
import {
  maskBodyText,
  maskEmail,
  maskLocation,
  maskPhone,
  maskWebsite,
  resolveEffectiveContact,
} from '../utils/privacy';

/** 从简历所有自由文本里收集一个字段类型在给定动作下的真实命中，用于在规则旁展示处理效果。 */
function collectBodyHit(resume: Resume, field: BodyTextField, action: MaskAction): string | null {
  if (action === 'keep') {
    return null;
  }
  const probe: PrivacyRules['body'] = { idNumber: 'keep', salary: 'keep', birthDate: 'keep' };
  probe[field] = action;
  const candidates: string[] = [resume.summary];
  resume.workExperiences.forEach((item) => {
    candidates.push(item.position, item.companyName, ...item.responsibilities, ...item.achievements);
  });
  resume.projects.forEach((project) => {
    candidates.push(project.name, project.role, project.description, ...project.outcomes);
  });
  resume.educations.forEach((education) => {
    candidates.push(education.school, education.major, ...education.honors);
  });
  resume.skills.forEach((skill) => candidates.push(skill.name));

  for (const text of candidates) {
    if (!text) {
      continue;
    }
    const masked = maskBodyText(text, probe);
    if (masked !== text) {
      return text.replace(/\s+/g, ' ').slice(0, 60);
    }
  }
  return null;
}

function contactMaskedPreview(field: ContactField, value: string): string {
  if (!value) {
    return '（空，且已阻断全局资料回退）';
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
      return '中性剪影占位图';
    default:
      return value;
  }
}

function RuleCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="font-display text-xl font-semibold text-[var(--ink)]">{title}</h2>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function PrivacyConsole() {
  const { id } = useParams();
  const resumes = useResumeStore((state) => state.resumes);
  const resume = resumes.find((item) => item.id === id);
  const profile = useProfileStore((state) => state.profile);
  const updatePrivacyRules = useResumeStore((state) => state.updatePrivacyRules);
  const setContactPrivacy = useResumeStore((state) => state.setContactPrivacy);
  const setBodyPrivacy = useResumeStore((state) => state.setBodyPrivacy);
  const setPrivacyEnabled = useResumeStore((state) => state.setPrivacyEnabled);

  if (!resume) {
    return <EmptyState title="无法配置脱敏" description="没有找到这份简历，可能已被删除。" />;
  }

  // 归一化读取：旧备份 / 历史简历缺省 privacy 时按默认保护展示。
  const rules: PrivacyRules = resolvePrivacyRules(resume.privacy);

  const effective = resolveEffectiveContact(resume, profile);
  const realContactValue: Record<ContactField, string> = {
    phone: effective.phone,
    email: effective.email,
    location: effective.location,
    avatar: effective.avatarUrl ? '已上传头像' : '',
    website: effective.website,
  };
  const maskedContactCount = contactFieldOrder.filter((field) => rules.contacts[field] !== 'keep').length;
  const maskedBodyCount = bodyFieldOrder.filter((field) => rules.body[field] !== 'keep').length;

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 md:flex-row md:items-end">
        <div>
          <Link className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent-strong)]" to="/resumes">
            <ArrowLeft size={15} aria-hidden /> 返回简历列表
          </Link>
          <h1 className="mt-3 font-display text-4xl font-semibold">脱敏投递台</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            为「{resume.title}」独立配置投递时的隐私规则。规则只影响预览与 PDF 导出，不会修改原简历或全局资料；复制简历后规则各自独立。
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
        <div className="space-y-5">
          {/* 总开关 */}
          <section className="border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--accent-soft)] text-[var(--accent-strong)]">
                  {rules.enabled ? <ShieldCheck size={18} aria-hidden /> : <EyeOff size={18} aria-hidden />}
                </span>
                <div>
                  <p className="font-semibold text-[var(--ink)]">投递脱敏保护</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                    关闭后预览/导出展示真实资料；规则仍会保留，不会因离开页面而重置。
                  </p>
                </div>
              </div>
              <Switch
                checked={rules.enabled}
                onChange={(checked) => setPrivacyEnabled(resume.id, checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border border-[var(--border)] transition ${
                  rules.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--surface-alt)]'
                }`}
              >
                <span
                  className={`mt-0.5 h-5 w-5 rounded-full bg-[var(--surface)] transition ${
                    rules.enabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </Switch>
            </div>
            {rules.enabled ? (
              <p className="mt-4 flex items-center gap-2 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-strong)]">
                <ShieldCheck size={14} aria-hidden />
                保护中：{maskedContactCount} 项联系方式、{maskedBodyCount} 项正文信息将被处理
              </p>
            ) : (
              <p className="mt-4 flex items-center gap-2 rounded-md bg-[var(--surface-alt)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">
                <Eye size={14} aria-hidden />
                当前为明文投递，预览与导出均展示原始联系方式
              </p>
            )}
          </section>

          {/* 联系方式 */}
          <RuleCard title="联系方式与资料">
            {contactFieldOrder.map((field) => {
              const action = rules.contacts[field];
              const realValue = realContactValue[field];
              return (
                <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3" key={field}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--ink)]">{contactFieldLabels[field]}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {field === 'avatar' ? realValue || '未设置头像' : realValue || '简历为空（将回退全局资料）'}
                      </p>
                    </div>
                    <ActionSegmented
                      ariaLabel={`${contactFieldLabels[field]}处理方式`}
                      onChange={(next) => setContactPrivacy(resume.id, field, next)}
                      value={action}
                    />
                  </div>
                  {rules.enabled && action === 'mask' ? (
                    <p className="mt-2 break-all rounded bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent-strong)]">
                      投递预览：{contactMaskedPreview(field, realValue)}
                    </p>
                  ) : null}
                  {rules.enabled && action === 'omit' ? (
                    <p className="mt-2 rounded bg-[var(--surface-alt)] px-2 py-1 text-xs text-[var(--muted)]">
                      投递预览中整项不展示（含全局资料回退值）
                    </p>
                  ) : null}
                </div>
              );
            })}
          </RuleCard>

          {/* 正文信息 */}
          <RuleCard title="正文敏感信息">
            <p className="flex items-start gap-2 text-xs leading-5 text-[var(--muted)]">
              <FileWarning size={14} className="mt-0.5 shrink-0" aria-hidden />
              证件号、薪资、出生日期会在摘要、工作 / 项目 / 教育等所有正文文本中自动识别：保留显示原文；遮蔽保留字段名并以星号替换；省略会把命中的整段内容（含字段名）从正文移除，不留下原值或星号。识别基于关键字与号码结构，避免误伤任职日期。
            </p>
            {bodyFieldOrder.map((field) => {
              const action = rules.body[field];
              const hit = collectBodyHit(resume, field, action);
              const processedHit = hit
                ? maskBodyText(hit, { idNumber: 'keep', salary: 'keep', birthDate: 'keep', [field]: action })
                : null;
              return (
                <div className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-3" key={field}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--ink)]">{bodyFieldLabels[field]}</p>
                    <ActionSegmented
                      ariaLabel={`${bodyFieldLabels[field]}处理方式`}
                      onChange={(next) => setBodyPrivacy(resume.id, field, next)}
                      value={action}
                    />
                  </div>
                  {rules.enabled && action !== 'keep' && hit && processedHit ? (
                    <p className="mt-2 break-all rounded bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent-strong)]">
                      {action === 'omit' ? (
                        <>省略示例：<span className="line-through opacity-70">{hit}</span> → {processedHit || '（整段移除）'}</>
                      ) : (
                        <>遮蔽示例：<span className="line-through opacity-70">{hit}</span> → {processedHit}</>
                      )}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </RuleCard>

          {/* 预设 */}
          <section className="border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-[var(--ink)]">
              <Sparkles size={17} aria-hidden /> 快速预设
            </h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <Button onClick={() => updatePrivacyRules(resume.id, createDefaultPrivacyRules())}>默认保护</Button>
              <Button onClick={() => updatePrivacyRules(resume.id, createStrictPrivacyRules())}>严格投递</Button>
              <Button onClick={() => updatePrivacyRules(resume.id, createOpenPrivacyRules())}>暂不脱敏</Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
              默认保护遮蔽全部联系方式与正文敏感项；严格投递额外省略头像；暂不脱敏关闭保护并恢复明文。
            </p>
            <Link
              className="mt-4 flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--ink-invert)] hover:bg-[var(--accent-strong)]"
              to={`/resumes/${resume.id}/export`}
            >
              <Download size={16} aria-hidden /> 前往 PDF 导出预览
            </Link>
          </section>
        </div>

        {/* 实时投递预览 */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            {rules.enabled ? <ShieldCheck size={16} className="text-[var(--accent-strong)]" aria-hidden /> : <Eye size={16} aria-hidden />}
            投递预览{rules.enabled ? '（已脱敏）' : '（明文）'}
          </div>
          <div className="overflow-auto bg-[var(--surface-alt)] p-4">
            <div className="mx-auto w-full max-w-[794px]">
              <ResumePreview fontSize={12} resume={resume} />
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            预览与 PDF 导出同源：刷新或连续导出结果一致，遮蔽标记不会重复叠加。编辑器内的资料表单仍显示原始数据。
          </p>
        </div>
      </div>
    </div>
  );
}
