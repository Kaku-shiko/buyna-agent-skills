# Skill 1: Customer Information Collection

Ask once:

```text
请一次提供以下信息，不确定的内容可写“待补全”：
1. 网站类型：商城、服务、展示、预约或其他
2. 业务分支：商品销售、服务提供或不适用
3. 公司或品牌名称及地址
4. 网站主语言及其他语言
5. 是否公开显示价格；如显示，请写币种
6. 已有素材：Logo、公司介绍、商品/服务资料、图片/视频、参考链接或模板、其他文件
```

Use prices from supplied product materials when present. Otherwise record
`价格来源：管理后台维护` without asking. Never invent a price.

When no Logo or specific company/product/service images are supplied, record
`Logo：之后补全` and `具体图片：之后补全` automatically. Do not ask a
follow-up, block approval, invent assets, or treat generated/placeholders as
approved customer materials.

Record incomplete address, copy, translations, links, and other non-blocking
materials as `待补全`. Do not recommend reference websites; record only user-
supplied references.

Output:

```text
客户信息收集记录
网站类型：
业务分支：
客户公司/品牌名称：
公司地址：
网站主语言：
其他语言：
页面是否显示价格：
价格类型（商品/服务/方案）：
货币：
价格来源（客户提供/管理后台维护）：
现有资料素材：
使用者提供的参考资料：
之后补全的资料：
阻塞项：无 / <仅列真正阻塞项>
```
