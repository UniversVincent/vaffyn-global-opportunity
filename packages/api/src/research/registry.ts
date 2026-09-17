import type { ResearchCitation, ResearchGap, ResearchSourceKind } from 'librechat-data-provider';

const health =
  'https://www.immigration.govt.nz/process-to-apply/applying-for-a-visa/providing-evidence-and-documents-to-support-your-visa-application/health-requirements/';

export const licenseUrl = 'https://www.immigration.govt.nz/about-us/about-this-site/copyright/';
export const robotsUrl = 'https://www.immigration.govt.nz/robots.txt';
export const registryVersion = 'nz-medical-public-v1';
export const topic = 'nz-medical-public';
export const reviewedAt = '2026-09-13T10:11:35.000Z';
export const reviewValidUntil = '2026-10-13T10:11:35.000Z';
export const freshnessMs = 24 * 60 * 60 * 1000;
export const cooldownMs = 60 * 1000;

export interface SourceDefinition {
  id: string;
  url: string;
  title: string;
  kind: ResearchSourceKind;
  relatedIds: string[];
  reviewedHash: string;
  excerptPermissionReviewed: boolean;
}

export const sources: SourceDefinition[] = [
  {
    id: 'procedure',
    url: `${health}how-to-get-an-x-ray-or-medical-examination/`,
    title: 'How to get an X-ray or medical examination',
    kind: 'official_guidance',
    relatedIds: ['requirements', 'doctors', 'identity', 'references'],
    reviewedHash: '80515c7784aa78fd9f83192d8143dc5ad2861fc9fa1a2f4c7d0dc840d81e07be',
    excerptPermissionReviewed: true,
  },
  {
    id: 'requirements',
    url: `${health}who-needs-an-x-ray-or-medical-examination/`,
    title: 'Who needs an X-ray or medical examination',
    kind: 'official_guidance',
    relatedIds: ['procedure'],
    reviewedHash: 'e7979a04a0295744e9b93b5000413df1381655b774f258ec12b7781db65c1595',
    excerptPermissionReviewed: true,
  },
  {
    id: 'doctors',
    url: `${health}doctors-who-can-do-x-rays-and-medical-examinations/`,
    title: 'Doctors who can do X-rays and medical examinations',
    kind: 'official_guidance',
    relatedIds: ['procedure'],
    reviewedHash: 'efed32135a07a349b867ae6ad80cc83e2acc7ace0d76ec43f13993447cd44bdd',
    excerptPermissionReviewed: true,
  },
  {
    id: 'identity',
    url: `${health}proving-your-identity-for-x-rays-and-medical-examinations/`,
    title: 'Proving your identity for X-rays and medical examinations',
    kind: 'official_guidance',
    relatedIds: ['procedure'],
    reviewedHash: '89d0a50d99376573059831844ece85743fc39ae457c29ecbd93ba12e7431126b',
    excerptPermissionReviewed: true,
  },
  {
    id: 'references',
    url: `${health}finding-your-emedical-and-inz-health-case-reference-numbers/`,
    title: 'Finding your eMedical and INZ health case reference numbers',
    kind: 'official_guidance',
    relatedIds: ['procedure'],
    reviewedHash: 'cb0468121384703194fc0dcf1b06dd953d1cc2f3c96a6300dd868d200468953a',
    excerptPermissionReviewed: true,
  },
];

export const policyReview = {
  licenseHash: '219ffdcaa00450b1044b754fc6271caf34815fc3fc8b2159a66361627d0eea9b',
  robotsHash: '7309e44f6a880532d99f8f1f6f2280e861b44367af6507d740fc28d1d2afe13f',
};

export interface ClaimDefinition {
  id: string;
  title: string;
  explanation: string;
  citations: ResearchCitation[];
}

export const claims: ClaimDefinition[] = [
  {
    id: 'scope',
    title: '先核对公开要求，不据此判断个人资格',
    explanation:
      '是否需要胸片或体检，不能从这一份通用流程直接推定。应继续查看官方关于签证类别、停留时间及既往检查等要求；本资料包不接收病史，也不判断任何个人的体检义务或签证资格。',
    citations: [
      {
        sourceId: 'requirements',
        section: 'Types of medical certificate',
        quotation: 'What you need to provide depends on the type of visa',
      },
    ],
  },
  {
    id: 'appointment',
    title: '预约前核对官方医生目录',
    explanation:
      '官方流程要求先确认所在国家或地区是否有指定医生，再按相应安排预约。无指定医生及在新西兰拍胸片等情形有不同说明，不能把一个国家的做法套用到所有地方。医生的实时名单、联系方式和可预约时间应在原站继续核对。',
    citations: [
      {
        sourceId: 'procedure',
        section: '2. Make an appointment',
        quotation: 'unless there are no panel physicians in your country.',
      },
      {
        sourceId: 'doctors',
        section: 'Doctors who can do X-rays and medical examinations',
        quotation: 'if there is one in your country.',
      },
    ],
  },
  {
    id: 'identity',
    title: '准备身份证明，注意原件要求',
    explanation:
      '身份核验有独立的官方页面。页面说明可接受文件及适用条件，并要求使用原件；不要默认手机照片或复印件可以替代。此处不替用户选择适用的替代证件，具体情形应回到原站核对。',
    citations: [
      {
        sourceId: 'identity',
        section: 'Acceptable identity documents',
        quotation: 'The document must be an original',
      },
    ],
  },
  {
    id: 'references',
    title: '区分 NZER 与 NZHR 参考号',
    explanation:
      'eMedical reference number（NZER）与 INZ health case reference number（NZHR）是不同的参考号。官方页面分别说明其来源和用途，不能互相替代；本资料包不替任何个人生成、查找或判断其应使用的号码。',
    citations: [
      {
        sourceId: 'references',
        section: 'eMedical reference number (NZER)',
        quotation: 'Your NZER is used to identify you in the eMedical system.',
      },
      {
        sourceId: 'references',
        section: 'INZ health case reference number (NZHR)',
        quotation: 'we will create a case in eMedical for you.',
      },
    ],
  },
  {
    id: 'results',
    title: '检查后按官方说明取得结果与凭据',
    explanation:
      '官方流程分别介绍如何在申请中提供检查证据及如何取得检查结果。操作时应保留诊所提供的信息，并核对自己收到的官方通知；本平台不提交申请、递交体检资料或管理申请进度。',
    citations: [
      {
        sourceId: 'procedure',
        section: '6. How to get your results',
        quotation: 'To get a copy of your results you can ask the doctor',
      },
      {
        sourceId: 'procedure',
        section: '5. Provide evidence of your results in your application',
        quotation: 'provide evidence',
      },
    ],
  },
];

export const gaps: ResearchGap[] = [
  {
    id: 'directory',
    description:
      '医生目录的动态筛选结果未抓取，未核验任何诊所、可预约时间或费用。请在官方目录继续查询。',
    url: sources[2].url,
  },
  {
    id: 'eligibility',
    description: '本次只覆盖公开办理流程，不覆盖所有签证类别的适用条件、健康标准、例外或个案判断。',
    url: sources[1].url,
  },
  {
    id: 'attachments',
    description:
      '关联表格和 PDF 仅提供发现的原站链接，未逐项解析、核验版本或确认第三方权利，未作为全文附件分发。',
    url: sources[0].url,
  },
];
