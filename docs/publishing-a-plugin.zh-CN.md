# 分享个人 Pixflow Design 插件

Pixflow 继续支持个人插件。继承的 Pixflow 社区资源目录及其提交命令已退役。本指南介绍本地创作，以及可选的发布到您自己的 GitHub 仓库；这些操作不会向 Pixflow 注册表提交资源。

## 创建、校验和打包

请使用 Pixflow 源码树以外的工作目录：

```sh
od plugin scaffold --id my-workflow --title "My workflow" --out ./personal-plugins
od plugin validate ./personal-plugins/my-workflow --no-daemon --json
od plugin pack ./personal-plugins/my-workflow --json
```

使用前请替换脚手架中的指令。文件夹包含 `SKILL.md` 和 `open-design.json`，并可附带参考资料和资源文件。改编现有技能时，请保留原作者的许可证、署名和归属声明。参见[清单参考](plugins-spec.zh-CN.md)和[技能协议](skills-protocol.md)。

## 本地安装

在守护进程运行时执行：

```sh
od plugin install ./personal-plugins/my-workflow --json
od plugin list --json
od plugin info my-workflow --json
```

安装保留资源标识和来源信息，但不会连接外部账户、授权远程操作或激活付费集成。

## 发布到自己的仓库

发布前请检查文件夹内容和目标仓库。此命令可以创建**公开**仓库，并推送插件文件和版本标签：

```sh
od plugin login
od plugin whoami --json
od plugin publish-repo ./personal-plugins/my-workflow --owner YOUR_GITHUB_LOGIN --dry-run --json
```

试运行会准备工作流程，不会发布。检查目标后，移除最后一条命令中的 `--dry-run` 再执行即可发布。GitHub 身份验证保留在 `gh` 中；Pixflow 不保存这些凭据。命令使用清单中的 `plugin.repo`，或通过受支持的 GitHub 流程确定目标所有者。请勿将客户数据、凭据或内部运维文件放入插件文件夹。

如需使用自己管理的外部目录，请参见[用户管理的注册表](self-hosting-a-registry.md)。已退役的 `od plugin publish`、`od plugin open-design-pr` 和 `od plugin yank` 命令不可用。现有安装内容和已保存快照会保留。
