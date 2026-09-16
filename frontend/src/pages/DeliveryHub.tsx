import { Link } from 'react-router-dom';
import { ChevronRight, Eye, ShieldCheck } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { useResumeStore } from '../stores/resume';
import { resolvePrivacyRules } from '../types/privacy';

export function DeliveryHub() {
  const resumes = useResumeStore((state) => state.resumes);

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 border-b border-[var(--border)] pb-6 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-semibold uppercase text-[var(--accent-strong)]">Masked delivery</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">脱敏投递台</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            每份简历独立维护电话、邮箱、地址、头像、主页以及正文证件号 / 薪资 / 出生日期的保留、遮蔽或省略规则。规则只影响预览与导出，不会改动原简历或全局资料。
          </p>
        </div>
      </div>

      {resumes.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="还没有简历"
            description="先在简历列表创建一份简历，再为它配置投递脱敏规则。"
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {resumes.map((resume) => {
            const rules = resolvePrivacyRules(resume.privacy);
            const contactMasked = Object.values(rules.contacts).filter((action) => action !== 'keep').length;
            const bodyMasked = Object.values(rules.body).filter((action) => action !== 'keep').length;
            const usesFallback =
              !resume.basicInfo.phone || !resume.basicInfo.email || !resume.basicInfo.location || !resume.basicInfo.website;
            return (
              <Link
                key={resume.id}
                className="group flex flex-col justify-between gap-4 border border-[var(--border)] bg-[var(--surface)] p-5 shadow-panel transition hover:-translate-y-0.5"
                to={`/delivery/${resume.id}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-2xl font-semibold text-[var(--ink)]">{resume.title}</h3>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        rules.enabled
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                          : 'bg-[var(--surface-alt)] text-[var(--muted)]'
                      }`}
                    >
                      {rules.enabled ? <ShieldCheck size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
                      {rules.enabled ? '保护中' : '明文'}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                    {rules.enabled
                      ? `遮蔽 ${contactMasked} 项联系方式、${bodyMasked} 项正文信息`
                      : '当前投递不做脱敏处理'}
                  </p>
                  {usesFallback ? (
                    <p className="mt-2 text-xs font-semibold text-[var(--gold)]">
                      部分联系方式来自全局资料，规则会一并处理，不会泄露
                    </p>
                  ) : null}
                </div>
                <span className="inline-flex items-center justify-end gap-1 text-sm font-semibold text-[var(--accent-strong)]">
                  配置规则
                  <ChevronRight size={15} aria-hidden className="transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
