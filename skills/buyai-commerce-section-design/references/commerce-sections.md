# 电商标准区域模块

该模块标准化区域职责、可选布局、数据字段、操作、状态和配置，不包含商家样式、业务状态机或数据库。入口为 `scripts/commerce-sections.mjs`，完整目录为 `assets/commerce-section-catalog.json`。安装该 Skill 时一起携带，无需新增后端包。

## 设计出图前选择

先读取用户上传资料及已确认电商范围，再给出区块选择表：页面、区块ID、必需/条件/可选、保留与否、顺序、数量、布局、素材来源、缺项。必需项固定保留；可选项使用建议默认值并允许用户关闭或替换。同类商品区域可以多次使用，例如新品与精选使用不同ID和数据源。

用户要求出图前选择时，在此处收集一次选择后再生成图；已有明确指令或已确认配置直接沿用，不重复问。此选择记录并入现有设计交付，不自行授予业务能力、推进工作流或批准上线。

## 23类区域选项

|类型|区块|采用条件|
|---|---|---|
|announcement|公告栏|有真实公告时可选|
|navigation|导航栏|首页、列表、详情必需|
|hero|首屏Banner|可选，不要求所有首页都有大图|
|categories|分类入口|首页与商品展示至少保留一种|
|product-grid|商品展示|列表页必需；首页与分类入口至少一种；详情推荐可选|
|campaign|专题区域|有真实专题和跳转目标时可选|
|brand-benefits|品牌与服务|有已确认资料时可选|
|reviews|真实评价|有真实评价数据时可选|
|footer|页脚|首页、列表、详情必需；含适用政策入口|
|listing-tools|筛选与排序|商品列表页必需，具体筛选项依商品属性|
|breadcrumbs|面包屑|列表和详情可选|
|product-gallery|商品图片|有适用图片时采用；不伪造商品图|
|product-info|商品信息|商品详情必需|
|variant-picker|规格选择|商品有可选规格时必需|
|purchase-actions|购买操作|商品详情必需|
|product-description|商品说明|按商品资料采用|
|shipping-returns|配送与退换|商品详情必需，按交易类型显示真实适用条款|
|cart-items|购物车商品|购物车必需，不裁剪真实交易明细|
|cart-summary|购物车费用|购物车必需|
|buyer-form|买家与配送信息|买家信息页必需，字段按已确认业务|
|order-review|订单确认|订单确认页必需|
|payment-methods|支付选择|支付页必需，仅展示实际可用渠道|
|payment-result|支付结果|结果页必需，状态来自已验证后端|

编译器检查固定页面必需项和首页发现入口。规格是否存在、评价是否真实、素材是否获授权等依赖项目事实，必须由设计者核实，不能把编译通过当作业务核验。

## 配置及数量

复制 `assets/commerce-home.example.json` 到项目设计目录再修改；数组顺序就是设计顺序。

- `id`：同页唯一，便于不同方案和组件追踪。
- `type`：目录中的区域类型。
- `enabled`：开关，默认true。固定必需项不允许关闭。
- `count`：集合区域显示数量；任意非负安全整数，0隐藏，null展示已加载的全部。省略使用目录默认值，不是固定上限。
- `columns`：desktop/tablet/mobile每行列数，独立于总数量。可局部覆盖；正整数，不自动修改count。
- `layout`：目录列出的可选布局，例如hero的split/full-bleed/contained，商品的grid/editorial/horizontal。
- `source`：项目数据源引用，不是可执行代码或任意远程URL。渲染器通过项目已授权Adapter映射读取。
- `title`：项目确认的区域标题。

```js
import { compileCommercePage, selectCommerceSectionItems } from './commerce-sections.mjs';
const page = compileCommercePage(projectPageConfig);
const section = page.sections.find(s => s.id === 'new-products');
const view = selectCommerceSectionItems(section, scopedOrderedProducts);
// view.items用于展示。数量不足不补假数据，不修改原数组。
```

CLI从本Skill目录运行：

```powershell
node scripts/commerce-sections.mjs --input assets/commerce-home.example.json
```

可选数量不是购买件数、库存、订单行数、支付方式数量或表单字段数量。交易明细不能用count截断；单体和交易区块不接受count/columns。商品列表应分页或加载更多，首页推荐可链接完整列表；`remainingLoadedCount`只表示当前输入数组未展示的数据，不是服务器总量或分页游标。`null`不代表抓取整个数据库。

## 三种组合示例

`assets/commerce-combinations.example.json` 提供商品优先、品牌叙事、图片展示三种示例，区域顺序与布局不同。它们只是起点，不是商家授权或有素材的证明。未启用的业务不要生成对应页面。

## UI与业务边界

按批准的视觉方案实现区域组件与CSS，区域type映射项目组件，id作为稳定实例标识。页面配置和生成图共同交付。空、加载、错误等交互状态按目录逐项补齐，键盘焦点、图片替代文本、手机换行及减少动画策略由项目落实。轮播不要自动开启。

复用现有cart、checkout、settlement等公共行为。购物车抽屉→买家信息→订单确认→支付→已验证结果的流程不因区域排序而改变。不能通过布局配置隐藏应展示的费用或法律披露。
