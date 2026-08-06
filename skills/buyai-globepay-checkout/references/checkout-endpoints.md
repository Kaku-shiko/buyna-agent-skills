# GlobePay Checkout Endpoints

## QR Gateway

Use for website QR payment with WeChat or Alipay.

- Create: `PUT /gateway/partners/{partner_code}/orders/{order_id}`
- Pay page: `GET /gateway/partners/{partner_code}/orders/{order_id}/pay`
- Query: `GET /gateway/partners/{partner_code}/orders/{order_id}`
- Channel values: `Wechat`, `Alipay`, `Alipay+`.

## Hosted Credit Card / Bank Card

Normal merchant card flow must be GlobePay-hosted.

- Create hosted card preorder: `PUT /gateway/partners/{partner_code}/pre_card_orders/{order_id}`
- Open hosted card page: `GET /channels/card/partners/{partner_code}/gateway_orders/{order_id}/view`
- View URL requires signed params including `redirect`, `time`, `nonce_str`, and `sign`.
- Never collect raw card details in the merchant site.

## Mobile H5

- Create: `PUT /h5_payment/partners/{partner_code}/orders/{order_id}`
- Pay page: `GET /h5_payment/partners/{partner_code}/orders/{order_id}/pay`
- Prefer this flow for an enabled WeChat or Alipay channel in an ordinary
  mobile browser.
- Send the buyer only to the provider-returned or correctly signed pay URL.
- Include an HTTPS return URL that identifies the local pending order without
  exposing secrets.

## JSAPI

Use only inside WeChat/Alipay app-browser contexts.

- JSAPI: `PUT /jsapi_gateway/partners/{partner_code}/orders/{order_id}`
- Native JSAPI: `PUT /gateway/partners/{partner_code}/native_jsapi/{order_id}`
- Native JSAPI requires AppID setup, `appid`, and `customer_id`.

## Responsive Routing

Choose the next action on the server from the selected payment method, enabled
merchant channels, and trusted browser context:

| Context | Preferred next action |
| --- | --- |
| Matching WeChat/Alipay in-app browser | Enabled JSAPI |
| Ordinary mobile browser | Enabled Mobile H5 |
| Desktop browser | QR or signed hosted pay page |

Do not use viewport width alone to choose a payment endpoint. Treat user-agent
or client hints only as routing input, not authorization. The server must
validate the selected method and channel availability.

Return one explicit next-action type such as `redirect`, `invoke_jsapi`, or
`show_qr`. Include the local order id and safe return URL. On H5/JSAPI failure,
keep the order pending and return an approved fallback; never silently change
the buyer's selected payment method.

## Other

- Common cashier: `PUT /gateway/partners/{partner_code}/common_cashier_orders/{order_id}`
- UnionPay/web gateway: `PUT /web_gateway/partners/{partner_code}/orders/{order_id}`
- Use UnionPay only when docs and account explicitly enable it.
