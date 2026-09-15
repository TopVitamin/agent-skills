# TopVitamin Agent Skills

TopVitamin 面向 Codex 和其他兼容 Agent Skills 标准的工具，整理可复用的工作流 Skill。

## Skills

| Skill | 用途 | 安装路径 |
| --- | --- | --- |
| `vitamin-prototype-annotation` | 为 HTML、React、Vue 等前端原型添加低侵入的业务逻辑标注 | `skills/vitamin-prototype-annotation` |
| `old-system-ui-clone` | 基于 DOM/CDP 证据复刻老系统、竞品后台和企业管理页面，并完成 Page Map、交互与视觉 QA | `skills/old-system-ui-clone` |

## 安装

在 Codex 中运行 `$skill-installer`，并要求它从本仓库安装目标 Skill。例如：

```text
$skill-installer 从 GitHub 安装 TopVitamin/agent-skills 中的 skills/vitamin-prototype-annotation
```

也可以指定某个 Git ref，以固定安装版本。

`old-system-ui-clone` 需要浏览器/CDP 能力；公开 URL 或本地页面可使用 Playwright，登录态页面需要可访问用户会话的 Chrome/CDP 路径。Python 辅助脚本的依赖见该 Skill 内的 `scripts/requirements.txt`。

## 目录约定

- 每个 Skill 位于 `skills/<skill-name>/`。
- 每个 Skill 必须包含 `SKILL.md`。
- 脚本、参考资料、示例和测试放在对应 Skill 目录内。
- Skill 的说明、触发边界和运行方式以其自身的 `SKILL.md` 为准。

## 贡献

新增或修改 Skill 时，请同时补充适用范围、安装说明和必要测试，并在提交前运行仓库校验。

## 许可证

本仓库采用 [MIT License](LICENSE)。
