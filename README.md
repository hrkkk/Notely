# Notepad

一个基于 Tauri、React 和 TypeScript 的轻量跨平台文本浏览编辑器。

## 当前功能

- 新建、打开、保存、另存为文本文件
- 多标签编辑
- 未保存状态提示
- 查找下一个匹配
- 行号、光标行列、行数、词数、字符数
- 自动换行开关
- 根据扩展名识别常见编程语言类型

## 开发

需要先安装 Node.js、Rust 和 Tauri 的系统依赖。

```bash
npm install
npm run tauri:dev
```

## Windows Release 构建

第一次构建前，可以用管理员 PowerShell 配置 Windows 环境：

```powershell
.\scripts\setup-windows-env.ps1
```

然后编译 release：

```powershell
.\scripts\build-release.ps1
```

构建成功后，安装包通常位于：

```text
src-tauri\target\release\bundle
```
