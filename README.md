# Notes and Projects

设计,灵感来源于我最喜欢的艺术家YE(kanye west),[yeezy.com](https://yeezy.com/)

## 启动

需要 Python 3。在项目根目录运行下面的命令。

```sh
python3 serve.py
```

在浏览器打开 [本地首页](http://127.0.0.1:4321/)。修改文件后刷新页面即可，在终端按 `Control+C` 停止服务。

## 使用

- 点击首页的条目查看作品或笔记，点击右上角的 **YANG SHUO** 查看简介和社交链接。
- 点击左上角的地球或月球切换亮暗模式，网站会记住你的选择。
- 通过页脚的 **Report an Issue** 反馈问题。选择对应的条目，用 Markdown 写下问题并预览，也可以附上截图，点 **Annotate** 标出位置，再点 **Submit Report** 提交。

反馈保存在项目根目录的 `feedback.jsonl`，截图保存在 `feedback-images/`。如果只托管 `dist/`，需要另行部署 `/api/feedback` 才能在线接收反馈。

## 添加作品或笔记

1. 在 `dist/entries/` 新建 HTML 页面，文件名可用小写字母、数字和连字符。图片放在 `dist/media/`。 [笔记示例](dist/entries/simple-api.html) · [带图作品示例](dist/entries/http-trace.html)
2. 在 [dist/index.html](dist/index.html) 的 `catalog-grid` 里添加条目，填好链接、标题和日期。如果用封面图，记得把条目标题写进图片的 `alt` 属性，反馈页面会用它来显示条目名称。

亮暗模式按钮使用了 NASA 的地球和月球纹理。 [地球纹理](https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/) · [月球纹理](https://svs.gsfc.nasa.gov/4720/)
