# 个人插件与清单兼容性

Pixflow 保留可移植技能、个人设计系统、可选的 craft 参考和已安装插件清单。继承的内置插件、craft、设计模板和设计系统目录已退役。清理内置源码不会删除个人资源、改变已保存的标识符，也不会授予付费集成的使用权限。

## 1. 资源格式

可移植技能是包含 `SKILL.md` 的文件夹，可以附带参考资料或资源文件。可选的 `open-design.json` 提供标识和结构化运行时元数据；技能指令仍保留在 `SKILL.md` 中。

```text
my-workflow/
  SKILL.md
  open-design.json
  references/
  assets/
```

个人 `DESIGN.md` 和 craft 参考仍是可选的运行时资源。格式详见[技能协议](skills-protocol.md)、[个人设计系统编写指南](design-systems.md)和[格式示例](examples/saas-landing-skill/SKILL.md)。改编他人资源时，应保留来源、许可证和作者署名。

## 2. 导入个人插件

明确指定本地文件夹或受支持的来源地址。例如：

```sh
od plugin validate ./my-workflow --json --no-daemon
od plugin install ./my-workflow
od plugin list --json
```

格式校验不等于运行授权。安装和执行仍受运行时兼容性、已配置集成和权限控制。可读取的清单不会自动连接外部账户或建立付费权益。个人文件和凭据应留在配置的运行时存储中，不得复制到源码仓库或发行包。

## 3. 标识与更新

更新资源时，保留稳定的名称、已保存的插件标识和现有安装路径。`specVersion` 表示清单格式版本，`version` 表示资源版本。行为或附带文件发生变化时应更新资源版本；已有引用和应用快照仍需符合运行时的兼容性规则。

可选字段包括本地化展示文本、作者、许可证、兼容技能路径、上下文引用、能力声明、预览信息和流水线声明。Schema 中存在某个字段，并不代表相应界面功能、提供商或集成已经可用；实际行为由运行时校验及所属集成决定。

## 4. 必需的内置指引

Free 保留四个功能技能和两个源码路由：

- `guidance/scenarios/od-default`：Home 路由。
- `guidance/examples/web-clone`：Website Clone 路由。

为兼容已有标识，WordPress 和桌面包仍使用 `plugins/_official/scenarios/od-default` 与 `plugins/_official/examples/web-clone` 作为安装目标。Bridge 保留原有的 Website Clone 路由契约，并支持已安装归档中的旧路径。私有 Bridge 的 `skills/web-clone` 仅来自明确配置且兼容的 Pro 源码。兼容安装路径不代表恢复源码目录库。

## 5. `open-design.json`

[插件清单 Schema](schemas/open-design.plugin.v1.json) 是机器可读的格式参考。必需字段为 `specVersion`、`name` 和 `version`；名称须遵守 Schema 的稳定标识语法。

```json
{
  "specVersion": "1.0.0",
  "name": "my-workflow",
  "title": "My workflow",
  "version": "1.0.0",
  "description": "A personal reusable workflow."
}
```

引用文件须符合资源路径规则。只有元数据的文件夹不会因为 JSON 校验通过就成为可运行技能。流水线 atom 标识及其运行时职责见 [atom 参考](atoms.md)。

## 6. 外部索引兼容性

[索引 Schema](schemas/open-design.marketplace.v1.json) 继续服务外部、用户管理的索引及现有资源元数据。顶层必需字段为 `specVersion`、`name`、`version`、`plugins`；每个插件条目必需字段为 `name`、`source`、`version`。

外部来源与内置指引分别管理。导入和更新时须保留来源、版本及完整性元数据。信任决策、集成凭据及付费操作授权仍由运行时负责。本仓库不提供替代公共 registry 或社区目录。

另见[存储与恢复](private-project-storage.md)、[当前架构](architecture.md)、[打包兼容性](pixflow-design-local-packaging.md)及[参考来源与署名](references.md)。
