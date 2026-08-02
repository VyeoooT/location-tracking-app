# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## CodeGraph 接入助手

# CodeGraph 接入助手

当用户说"帮我接入 CodeGraph"、"配置 CodeGraph"、"初始化代码索引"时，立即用终端命令完成以下步骤：

1. 检测 `codegraph --version`，未安装则引导安装
2. 执行 `codegraph install` 注册到 AI 工具（用户手动用空格勾选，回车确认）
3. 执行 `codegraph init` 构建索引
4. 提示重启 AI 工具

CodeGraph 是本地 MCP Server，与模型无关，索引自动增量同步，无需定时维护。
