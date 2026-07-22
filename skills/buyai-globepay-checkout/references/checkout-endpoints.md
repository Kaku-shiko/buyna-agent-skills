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

## JSAPI

Use only inside WeChat/Alipay app-browser contexts.

- JSAPI: `PUT /jsapi_gateway/partners/{partner_code}/orders/{order_id}`
- Native JSAPI: `PUT /gateway/partners/{partner_code}/native_jsapi/{order_id}`
- Native JSAPI requires AppID setup, `appid`, and `customer_id`.

## Other

- Common cashier: `PUT /gateway/partners/{partner_code}/common_cashier_orders/{order_id}`
- UnionPay/web gateway: `PUT /web_gateway/partners/{partner_code}/orders/{order_id}`
- Use UnionPay only when docs and account explicitly enable it.
