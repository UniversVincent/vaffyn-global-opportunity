<p align="center">
  <img src="client/public/assets/vaffyn.svg" width="88" alt="Vaffyn 标志">
</p>

<h1 align="center">Vaffyn 全球机会研究助手</h1>

<p align="center">
  面向中文用户、支持多语言的开源海外工作与出国信息研究助手。
</p>

<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong> ·
  <a href="https://avenory.vaffyn.com/">在线预览</a>
</p>

> 当前是早期公开预览版。核心交互与研究样例已经可以验证，但仓库还未达到生产可用标准，付费和高成本数据功能也尚未正式接入。

## 为什么做这个项目

很多人在失业、转行或收入压力下想扩大求职范围，但海外岗位、政府政策和办理信息分散在不同网站，也经常变化。这个项目希望让普通用户先用自然语言说清楚自己的情况，再逐步得到可核对的研究结果，而不是一上来填写很长的表格。

产品计划帮助用户：

- 用中文或其他支持的语言说明经历和目标；
- 只回答那些会真正改变研究方向的关键追问；
- 逐步建立经过本人确认、可以复用的海外档案；
- 研究当前岗位与政策信息，并保留可追溯来源；
- 清楚看到哪些信息已经确认、哪些仍缺失、哪些必须交给合格专业人员。

本项目不会替用户提交工作或签证申请，也不做申请进度管理。它是信息研究工具，不是自动投递工具、移民顾问或律师事务所。

## 目前已经实现

- **直接进入聊天：** 打开页面后先看到正常聊天界面，不强制先登录。
- **分级使用流程：** 当前原型支持游客 5 次对话；本地账号免费档每天 10 次。普通会员和高级会员的额度已经写入代码，但支付尚未接通。
- **渐进式档案：** 助手按当前任务追问关键缺失信息，提取事实后先展示给用户确认，确认后才写入档案。
- **多语言界面：** 已包含简体中文、繁体中文和英文文案，简体中文是主要产品语言。
- **高级功能门槛：** 深度研究、文档输入、证据导出和扩展数据调用目前只向高级档开放。
- **本地文档解析：** 已支持 TXT、Markdown 和 DOCX，并设置大小、数量和格式限制；PDF 尚未实现。
- **语音原型：** 已实现本地录音和回放，语音转文字仍明确标记为待开发。
- **证据研究样例：** 以新西兰签证体检为样例，实现了官方来源登记、重新抓取、版本哈希、时效判断、许可检查、逐项引用核验、缺项展示和受限导出。
- **账号与数据隔离原型：** 本地账号数据与公开证据存储分开，但这还不是生产级身份系统。

在线预览地址是 [avenory.vaffyn.com](https://avenory.vaffyn.com/)。开发和部署调整期间，预览可能暂时不可用。

## 目前没有完成

- 真实付款、订阅、退款、发票或扣款。
- 生产级登录、找回账号、邮箱或短信验证、风控与反滥用。
- 跨平台实时岗位聚合及外部数据接口。
- 深度找房、找学校和地图检索。
- 正式语音转写与 PDF 简历解析。
- 覆盖多个国家的完整政策来源地图。
- 自动投递工作、跟踪申请状态或代用户联系雇主。
- 生产部署加固，以及在全新环境中通过完整前端生产构建。

仓库不包含真实 API Key、用户数据、私有部署文件或生产支付配置。

## 产品原则

1. **先补关键信息，再给结论。** 只追问答案不同会改变下一步研究方向的问题。
2. **先确认，再保存。** 从聊天或文档中提取的资料，在用户确认前只是候选信息。
3. **官方来源优先。** 政策研究先从维护过的权威来源地图出发，需要时重新核查官网。
4. **不隐藏不确定性。** 页面抓取失败、版本过期、来源冲突和证据不足必须直接显示。
5. **研究不等于代理。** 不替用户提交申请，也不把受监管的个案建议伪装成普通聊天。
6. **付费购买深度，不是购买真相。** 高级档可以承担更多检索和计算成本，但免费回答不能故意降低准确度。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `client/src/components/Overseas` | 游客聊天、档案确认、会员门槛、文档与语音界面、研究页面 |
| `packages/api/src/guest` | 追问结果校验、额度、会话、本地账号和档案更新 |
| `packages/api/src/research` | 来源登记、抓取解析、证据核验、版本存储和导出 |
| `packages/data-provider/src/types` | 前后端共用的游客、档案、会员和研究类型 |
| `packages/data-schemas/src/preview` | 独立的预览版数据存储 |
| `e2e` | 游客、资料准备和研究流程浏览器测试 |
| `THIRD_PARTY_NOTICES.md` | LibreChat 上游署名与许可证说明 |

## 本地开发

底层依赖沿用上游项目，需要 Node.js 24、npm、MongoDB 以及 LibreChat 本身需要的服务。

```bash
git clone https://github.com/UniversVincent/vaffyn-global-opportunity.git
cd vaffyn-global-opportunity
npm ci
npm run build:data-provider
npm run frontend:dev
```

证据研究样例作为独立本地服务运行，公开证据和私有账号必须使用两个不同的绝对路径：

```bash
npm --workspace packages/data-schemas run build:preview
npm --workspace packages/api run build:research
RESEARCH_DATA_DIR=/absolute/public-evidence \
VAFFYN_LOCAL_ACCOUNTS_DIR=/absolute/private-accounts \
npm --workspace packages/api run start:research
```

AI 追问默认关闭。只有运行者主动启用并提供服务器端配置时才会调用模型。真实密钥不得提交到仓库：

```dotenv
VAFFYN_ENABLE_LOCAL_AI=true
VAFFYN_INTAKE_MODEL=your-supported-model
OPENAI_API_KEY=your-server-side-key
```

部署说明还在简化。底层服务可先参考 [LibreChat 官方文档](https://www.librechat.ai/docs)。

## 当前验证结果

本机已经实际验证：

- 9 组前端定向测试，共 65 项通过；
- 3 组游客、会员和研究 API 测试，共 63 项通过；
- 两个定制研究 TypeScript 工程编译通过；
- 2026-09-17 公网预览根地址返回 HTTP 200。

已知阻塞：完整 Vite 生产构建目前因本地 `@codesandbox/sandpack-client` 依赖无法解析而停止。定向测试和定制 TypeScript 编译通过，但不能因此宣称完整生产构建已经通过。后续安排见 [`ROADMAP.md`](ROADMAP.md)。

## 参与开发

当前最需要的是：可复现安装修复、来源核验测试、无障碍改进、账号隔离审查，以及附带一手来源的小范围国家或岗位来源登记。

提交代码前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)、[`SECURITY.md`](SECURITY.md) 和 [`ROADMAP.md`](ROADMAP.md)。

## 开源支持计划

维护者将申请 OpenAI 的开源支持项目。如果获得 API 额度或开发工具支持，将用于公开维护工作，包括 Issue 分类、测试覆盖、依赖与安全审查、来源核验工具、无障碍、文档和可复现部署。获得支持不等于产品被官方背书，也不代表尚未完成的功能已经可用。

## 许可证与署名

本项目基于 [LibreChat](https://github.com/danny-avila/LibreChat) 修改，并按 MIT License 发布。上游许可证和版权声明保留在 [`LICENSE`](LICENSE)，补充署名见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

界面品牌可以更换，但不能抹去上游作者贡献。为保持兼容，部分内部包名仍保留 LibreChat 名称。
