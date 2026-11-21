# 开发中的 UI 术语映射

用于需求整理、页面结构记录、组件检索和开发交接。保留用户原话，补充标准交互术语，再按当前技术栈选择真实组件。不要全局替换顾客可见文案、代码标识或数据库字段，也不要因为参考图使用 Flutter 就切换项目框架。

## 固定触发位置

- 页面结构阶段：识别用户所说的区域与交互，记录术语、用途和行为。
- 前端及后台实现阶段：依据项目已安装库的实际 API 确定实现组件；下表是候选，不是已经安装的证明。
- 检查阶段：核对行为是否符合语义，例如单选不能变多选，操作菜单不能变页面导航。
- 普通文案修改：只处理本次相关内容，不重命名已有组件或重建布局。

## 对照表

| 用户说法 | 标准术语 | Web / React 实现候选与判断 |
| --- | --- | --- |
| 顶部标题那一栏 | App bar / Header | 页面 header；不假定存在 AppBar 导出 |
| 顶部切换内容的标签 | Tabs | 同页内容切换用 Tabs；切换路由用导航链接 |
| 第二排标签 | Secondary tabs / Filter controls | 按内容切换或筛选语义决定，不照搬 Flutter TabBar.secondary |
| 底部切换大页面的图标 | Bottom navigation | 带文字与当前页状态的导航链接 |
| 底部放操作按钮的栏 | Bottom action bar | 固定操作区域，与底部导航区分 |
| 左边一竖条导航 | Navigation rail / Sidebar | 按紧凑图标轨道或完整侧栏决定 |
| 侧边滑出的菜单 | Navigation drawer | 导航内容搭配 Sheet/Drawer，保留焦点和关闭行为 |
| 顶部圆角搜索框 | Search field / Search bar | 搜索输入框；圆角仅是样式 |
| 点开的一组选项 | Menu / Select / Combobox | 执行动作用 DropdownMenu；选择表单值用 Select；可搜索选择用 Combobox |
| 鼠标放上去的说明 | Tooltip | 支持键盘焦点；触屏不能只依赖 hover 或长按 |
| 点击展开更多信息 | Popover | 可交互信息面板；不要把按钮和表单放进仅作提示的 Tooltip |
| 一张卡片 | Card | Card 或语义化容器；不因外观像卡片就增加点击行为 |
| 列表的一行 | List item | 列表项或业务组件；Flutter ListTile 不是 React 的通用导出 |
| 右下角悬浮按钮 | Floating action button (FAB) | Button 配合定位，声明主要操作与可访问名称 |
| 角上的数字或小红点 | Badge / Notification indicator | 明确数量或未读语义，不能只靠颜色表达状态 |
| 多个选项只能选一个 | Radio group | RadioGroup；Radio 是单选，不是多选 |
| 可以选好几个 | Checkbox group | Checkbox；保存选中集合 |
| 开关 | Switch | 二值设置；是否即时保存按业务契约决定 |
| 拖动调数值 | Slider | 声明最小值、最大值、步长和键盘操作 |
| 一排并列的切换选项 | Segmented control | 按语义选择 Tabs、RadioGroup 或 ToggleGroup，并明确单选/多选 |
| 圆角小标签 | Chip / Tag / Badge | 展示标签、筛选按钮与可删除标签分别实现 |
| 中间的弹窗 | Dialog | 一般弹窗用 Dialog；重要确认可用 AlertDialog |
| 底部滑上来的面板 | Bottom sheet | Drawer 或底部 Sheet，按实际库支持实现 |
| 底部一闪而过的提示 | Snackbar / Toast | 非阻塞反馈；表单错误仍显示在字段附近，不能只放短暂提示 |
| 收起来点开看 | Accordion / Disclosure | 单项展开或分组折叠 |
| 图片来回切换 | Carousel / Gallery | 轮播与商品图集区分；不默认自动播放 |
| 加载时的灰色占位 | Skeleton | 保持布局稳定，加载结束替换为内容或错误状态 |
| 顶部写着当前位置 | Breadcrumb | 页面层级路径，与主导航区分 |
| 表格上面的筛选栏 | Filter toolbar | 搜索、筛选条件和操作按钮，绑定真实查询契约 |
| 首屏大图 / banna | Hero / Banner | 首屏介绍用 Hero；活动广告用 Promotional banner；滚动多张再考虑 Carousel |

## 开发记录格式

例如用户说“侧边滑出来一个购物车”，记录：

- 原话：侧边滑出来一个购物车。
- 标准语义：Cart drawer，属于覆盖式购物车面板，不是 Navigation drawer。
- 实现候选：项目现有购物车组件；缺少时评估 Sheet/Drawer。
- 行为：打开、关闭、更新数量、删除商品、进入结账；复用固定购物车规则。
- 状态：空购物车、加载、数量更新中、更新失败、结账不可用。
- 可见文案：购物车、删除、去结算。不要显示“打开 Drawer”“执行 Mutation”。

“弹窗”“菜单”“标签”等词先结合上下文判断；若不同解释会改变行为且无法判断，只问一个简短问题。术语归一化不改变原需求。已经确认的删除不得改成归档，登录保持“登录”，顾客端继续使用正常售卖或预约文案。

## 验收

核对原话、标准语义、实现组件和实际行为一致；确认导入存在、键盘与触屏可操作、状态反馈清楚。单选/多选、导航/动作、提示/确认、购物车抽屉/导航抽屉分别检查。未接入的业务不得显示虚假的成功反馈。
