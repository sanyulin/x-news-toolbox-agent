X News Toolbox · Windows 便携版

启动
1. 解压完整文件夹，不要只复制 start.cmd。
2. 双击 start.cmd。
3. 浏览器将打开 http://localhost:3000。

首次配置
首次启动默认为未配置状态，不包含制作者的密钥、来源或历史数据。
打开“接口设置”，填写：
- Mind API Key
- Mind ID（可留空自动选择）
- Twitter / X API Key（Bearer Token，可选）
然后打开“信息来源”，添加自己的 RSS、Atom、JSON API、RSSHub 地址或 X 账号。

跨电脑使用
- 把整个文件夹复制到另一台 Windows 10/11 64 位电脑即可。
- 程序和 Node 运行时已内置，不需要安装 Node.js。
- 运行数据和密钥保存在 data 文件夹。配置后请像保护密码一样保护整个文件夹。
- 如果要把程序交给其他用户，请使用全新生成、data 目录为空的便携版，不要转发自己已经配置过的副本。

局域网访问
同一网络中的其他电脑可访问 http://本机IP:3000。
首次启动时若 Windows 防火墙询问，请仅允许可信的专用网络。

停止
关闭黑色运行窗口，或在窗口中按 Ctrl+C。
