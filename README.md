# 想法与作品

网站在 `dist/`。在项目目录运行：

```sh
python3 -m http.server 4321 --bind 127.0.0.1 --directory dist
```

在浏览器打开 [本地首页](http://127.0.0.1:4321)。保存文件后刷新页面即可看到修改。

- `dist/index.html` 保存首页条目和右上角「YANG SHUO」打开的简介。
- `dist/entries/` 每个 HTML 文件对应一个详情页。在 `detail-body` 内可以放正文、图片、项目链接和带播放控件的视频。
- `dist/media/` 保存图片。
- `dist/style.css` 开头的变量控制明暗配色、页面边距、详情页宽度和字体。

首页内容和图片都是版式示例。公开前，先换成自己的内容，再把 `dist/` 作为静态网站目录发布。
