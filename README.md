# 资源嗅探器（Resource Sniffer）

一个使用 TypeScript 编写的 Chrome（Manifest V3）扩展，能够抓取一个网站
使用到的全部资源——既包括通过网络发起的请求（`chrome.webRequest`），
也包括从实时 DOM/CSS 中扫描出来的资源——并在弹窗中提供按类型筛选、
按 URL 搜索以及 JSON 导出的能力。

## 能抓到什么

- **网络**：页面（及其 iframe）发起的每一个请求——document、script、
  stylesheet、image、media、font、XHR/Fetch、websocket 等，并附带
  状态码、HTTP 方法、MIME 类型和 `Content-Length` 大小。
- **DOM**：`<img src/srcset>`、`<picture><source>`、`<video>/<audio>`
  及其内部的 `<source>`、`<track>`、`<iframe>`、`<embed>`、`<object>`、
  `<script src>`、`<link>`（样式表、图标、preload/prefetch/modulepreload），
  以及**同源** CSS 规则中的 `url(...)` 引用（背景图、`@font-face`）。

两个来源在后台 worker 中按 URL 去重合并，因此弹窗里看到的是每个 tab
单一的合并列表。

## 项目结构

```text
public/             静态资源，构建时原样拷贝到 dist/
  manifest.json     MV3 配置清单
  popup.html        弹窗页面
src/
  background.ts     Service Worker —— webRequest 监听 + 消息路由
  content.ts        注入到每个 frame 的 DOM/CSS 扫描脚本
  popup.ts          弹窗 UI（筛选、搜索、导出）
  types.ts          共享的消息与记录类型
scripts/
  copy-static.mjs   tsc 之后把 public/ 拷到 dist/
tsconfig.json
package.json
```

## 构建与安装

```sh
pnpm install
pnpm build          # tsc → dist/，然后把 public/ 拷过去
```

然后在 Chrome 中：

1. 打开 `chrome://extensions`。
2. 右上角开启 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择 `dist/` 目录。
4. 打开任意网页，点击扩展图标，即可看到该页面用到的全部资源。顶层
   frame 跳转时列表会自动清空。

开发期可在一个终端跑 `pnpm watch`，每次改完代码在扩展卡片上点刷新按钮即可。

## 注意与限制

- 跨域的样式表无法从 content script 中读取——浏览器会禁止访问
  `sheet.cssRules`。这类样式表里的资源只要被实际请求过，仍会通过
  网络监听器被捕获。
- `webRequest` 不会观察到扩展自身发起的请求。
- 没有内置图标 PNG；如果想要自定义工具栏图标，把 16/48/128 三个尺寸
  放到 `public/icons/` 下即可（manifest 中已声明）。
