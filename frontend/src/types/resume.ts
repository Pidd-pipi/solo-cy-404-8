import { Education } from './education';
import { PrivacyRules } from './privacy';
import { Project } from './project';
import { Skill } from './skill';
import { WorkExperience } from './work-experience';

export type ResumeSectionType = 'summary' | 'work' | 'education' | 'skills' | 'projects';

export interface ResumeBasicInfo {
  fullName: string;
  headline: string;
  phone: string;
  email: string;
  location: string;
  website: string;
  avatarUrl?: string;
}

export interface ResumeSection {
  id: ResumeSectionType;
  title: string;
  enabled: boolean;
}

export interface Resume {
  id: string;
  title: string;
  templateId: string;
  createdAt: string;
  updatedAt: string;
  basicInfo: ResumeBasicInfo;
  summary: string;
  sections: ResumeSection[];
  workExperiences: WorkExperience[];
  educations: Education[];
  skills: Skill[];
  projects: Project[];
  /** 按简历独立维护的脱敏规则；缺省时按默认保护处理（旧备份兼容）。 */
  privacy?: PrivacyRules;
}

export type ResumeCollection = Resume[];

