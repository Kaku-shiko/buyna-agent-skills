# Buyna Commerce Storefront 0.1

为独立商户的定制前端提供统一调用方式。此包不创建商户，不提供管理权限，不包含支付密钥，也不替代 Commerce 的价格、库存、订单或付款校验。

## 两种接入方式

| 方式 | 用途 | 本版范围 |
| --- | --- | --- |
| `commerce` | 前端与现有 Commerce 路由同源，包括经过验证的商家域名 | 商品、页面、报价、预约、订单、支付请求与状态查询 |
| `gateway` | 商家有独立部署的定制前端 | 商品、页面、报价和支付可用方式；结账转到该店铺现有网站 |

独立前端当前不能通过此网关直接创建订单或付款。跨域一次性收银会话、返回地址和订单访问凭证交接尚未交付，因此网关拒绝这些操作。跳转现有店铺结账不会自动携带前端购物车，客户需在店铺重新选择。这不是独立 `pay` 收银台的完成证明。

## 前端调用

```js
import {createStorefrontClient, createSubmission} from '@buyna/commerce-storefront';

// siteSlug 取自本网站的服务端部署配置，不由访客输入。
const commerce = createStorefrontClient({siteSlug: siteConfig.siteSlug});
const catalog = await commerce.catalog();
const quote = await commerce.quote([{itemId, offerId, quantity: 1}]);

// 以下交易操作只在 commerce 同源模式启用。
const submission = createSubmission({
  lines: quote.lines.map(({itemId, offerId, quantity}) => ({itemId, offerId, quantity})),
  expectedTotal: quote.total,
  customer: {name, email, address},
});
// 必须在请求前保存完整 submission；网络失败时原样重试，不能另生成幂等键。
sessionStorage.setItem('pending:' + siteConfig.siteSlug, JSON.stringify(submission));
const result = await commerce.createOrder(submission);
const status = await commerce.order(result.order.id, submission.token);
```

访问凭证只用于对应订单。不要放在 URL、分析埋点、日志或模型输入中。订单成功后应保存订单 ID 与凭证，以便同浏览器恢复。SDK 不擅自重试付款或重新生成请求键。

## 独立前端的服务端适配器

```js
import {createStorefrontGateway} from '@buyna/commerce-storefront/server';

const gateway = createStorefrontGateway({
  frontendOrigin: 'https://merchant.example.com',
  commerceOrigin: 'https://shops.buynacommerce.com',
  siteSlug: registeredConnection.siteSlug,
});
// 接入 Node HTTP 请求处理器；返回 false 表示交给你的网站处理。
if (await gateway(req, res)) return;
```

部署前，从该商户已经授权的工作台确认店铺绑定，再填入服务端配置。SDK 中的 siteSlug 不授予管理权限。公开商品本来就允许访客查看，私有订单仍需访问凭证，管理接口仍需真实登录及店铺权限。

网关只提供 `/commerce/v1/config`、`catalog`、`pages/:slug`、`payment-options`、`quote` 与 `booking-quote`。不转发用户 Cookie、Authorization、店铺 ID 或代理 Host；拒绝调用者换店、任意上游、路径穿越和不匹配来源。它不是通用反向代理。

生产前端设置 HTTPS，部署层保留限流、请求超时和访问日志脱敏。`development:true` 只用于回环 HTTP 示例；不要在生产配置启用。

## SDK 方法

| 方法 | 参数/用途 |
| --- | --- |
| `catalog()` / `page(slug)` | 读取已公开商品与页面；草稿不通过公开接口返回 |
| `quote(lines)` | 服务端核价；不会占库存 |
| `bookingQuote(selection)` | itemId、offerId、adults、children、vehicleId、pickupPointId |
| `createOrder(submission)` / `createBooking(submission)` | 使用固定幂等键和访问凭证创建待付款订单 |
| `order(id, token)` / `booking(id, token)` | 查询订单或预约 |
| `paymentOptions()` | 仅展示 `collectionEnabled` 且 `available` 的支付选项 |
| `createPayment(id, token, input)` | optionId、context、固定 idempotencyKey；服务端选择店铺凭据 |
| `refreshPayment(id, attemptId, token)` | 由服务器核对结果，前端不得自行标记已付款 |
| `vouchers(id, token)` | 读取该订单可用的核销凭证 |

支付跳转须使用现有收银组件的 URL 校验，不应直接执行任意返回 URL。此版本未包含独立打包的收银 UI。

## 状态

本地验证：两个商户、商品报价、预约报价、重复请求、库存预留、订单访问凭证、跨商户拒绝、支付未启用时拒绝请求、来源限制和异常响应。

未完成：外部前端跨域收银会话、独立 api/pay 域名服务、公开 npm 发布、真实付款退款验收、生产限流压测。现有网站、云端 Skill 和线上数据库均未因本包修改。
