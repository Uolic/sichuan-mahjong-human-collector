# 牌面图片来源

牌面照片来自 `Camerash/mahjong-dataset` 中的中国麻将牌数据集：

- 仓库：https://github.com/Camerash/mahjong-dataset
- 许可证：MIT
- 用途：这里只保留万、条、筒 1～9 的牌面图片
- 处理：从同一套牌的照片中去除数据集附带的红色角标，并重命名为本项目使用的编号

文件名对应关系：

- `w1.jpg`～`w9.jpg`：一萬～九萬
- `t1.jpg`～`t9.jpg`：一条～九条
- `b1.jpg`～`b9.jpg`：一筒～九筒

其中 `t1.jpg`（鸟形幺鸡）重新选用了数据集中标签为 `bamboo-1` 的
`tiles-resized/65.jpg`，等比例中心裁切后缩放为 `209 × 312`，替换旧版线条较杂的幺鸡照片。
