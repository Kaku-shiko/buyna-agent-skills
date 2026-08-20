import { createHash, randomBytes, createCipheriv, createDecipheriv } from "crypto";

export type GlobePayMode = "mock" | "live";

export function getGlobePayMode(): GlobePayMode {
  return (process.env.GLOBEPAY_MODE as GlobePayMode) === "live" ? "live" : "mock";
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export function signedParams() {
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const credentialCode = requireEnv("GLOBEPAY_CREDENTIAL_CODE");
  const time = Date.now().toString();
  const nonce_str = randomBytes(12).toString("hex");
  const valid = `${partnerCode}&${time}&${nonce_str}&${credentialCode}`;
  const sign = createHash("sha256").update(valid, "utf8").digest("hex").toLowerCase();
  return { time, nonce_str, sign, partnerCode };
}

export function verifyNotifySignature(payload: Record<string, unknown>): boolean {
  if (getGlobePayMode() === "mock") return true;
  const time = String(payload.time ?? "");
  const nonce_str = String(payload.nonce_str ?? "");
  const sign = String(payload.sign ?? "");
  if (!time || !nonce_str || !sign) return false;
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const credentialCode = requireEnv("GLOBEPAY_CREDENTIAL_CODE");
  const expected = createHash("sha256")
    .update(`${partnerCode}&${time}&${nonce_str}&${credentialCode}`, "utf8")
    .digest("hex")
    .toLowerCase();
  return expected === sign.toLowerCase();
}

function buildUrl(path: string): string {
  const base = (process.env.GLOBEPAY_API_BASE_URL ?? "https://pay.globepay.co.jp").replace(
    /\/$/,
    "",
  );
  const { time, nonce_str, sign } = signedParams();
  const q = new URLSearchParams({ time, nonce_str, sign });
  return `${base}${path}?${q.toString()}`;
}

// ---- AES-256-GCM encryption for member_token ----
function getKey(): Buffer {
  const raw = process.env.BILLING_TOKEN_ENCRYPTION_KEY ?? "";
  // accept base64 or raw, hash to 32 bytes for safety
  return createHash("sha256").update(raw).digest();
}
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}
export function decryptSecret(packed: string): string {
  const [ivB64, tagB64, ctB64] = packed.split(".");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

// ---- ID helpers ----
function ymd(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function rand(): string {
  return randomBytes(4).toString("hex");
}
export const genBindRequestId = () => `BIND_${ymd()}_${rand()}`;
export const genClientOrderId = (prefix: "BUYNASETUP" | "BUYNAMONTHLY") =>
  `${prefix}_${ymd()}_${rand()}`;
export const genInvoiceNo = () => `BINV_${ymd()}_${rand()}`;
export const genHostedOrderId = () => `BUYNAHC_${ymd()}_${rand()}`;
export const genRecurringAgreementId = () => `BUYNAAGR_${ymd()}_${rand()}`;
export const genRecurringPreOrderId = () => `BUYNARPO_${ymd()}_${rand()}`;
export const genRecurringChargeId = () => `BUYNARCH_${ymd()}_${rand()}`;

// ---- API calls ----
type GpResp = { return_code: string; result_code: string; [k: string]: unknown };

export async function createBindCardOrder(args: {
  requestId: string;
  redirectUrl: string;
}): Promise<{ bindcard_url: string; raw: GpResp }> {
  if (getGlobePayMode() === "mock") {
    return {
      bindcard_url: `${args.redirectUrl}${args.redirectUrl.includes("?") ? "&" : "?"}mock=1`,
      raw: { return_code: "SUCCESS", result_code: "SUCCESS", request_id: args.requestId },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/bind_card_orders/${args.requestId}/create`,
  );
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ redirect_url: args.redirectUrl }),
  });
  const raw = (await res.json()) as GpResp;
  if (raw.return_code !== "SUCCESS" || raw.result_code !== "SUCCESS") {
    throw new Error(`GlobePay bind-card create failed: ${JSON.stringify(raw)}`);
  }
  return { bindcard_url: String(raw.bindcard_url ?? ""), raw };
}

export type BindCardResult = {
  status: "SUCCESS" | "NO_BIND" | "FAIL";
  member_token?: string;
  card_number?: string;
  card_type?: string;
  card_class?: string;
  card_country?: string;
  raw: GpResp;
};

export async function queryBindCardResult(requestId: string): Promise<BindCardResult> {
  if (getGlobePayMode() === "mock") {
    return {
      status: "SUCCESS",
      member_token: `mock_token_${requestId}`,
      card_number: "411111******1111",
      card_type: "visa",
      card_class: "credit",
      card_country: "JP",
      raw: { return_code: "SUCCESS", result_code: "SUCCESS" },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const url = buildUrl(`/api/v1.0/gateway/partners/${partnerCode}/bind_card_orders/${requestId}`);
  const res = await fetch(url, { method: "GET" });
  const raw = (await res.json()) as GpResp;
  const status =
    raw.result_code === "SUCCESS" ? "SUCCESS" : raw.result_code === "NO_BIND" ? "NO_BIND" : "FAIL";
  return {
    status,
    member_token: typeof raw.member_token === "string" ? raw.member_token : undefined,
    card_number: typeof raw.card_number === "string" ? raw.card_number : undefined,
    card_type: typeof raw.card_type === "string" ? raw.card_type : undefined,
    card_class: typeof raw.card_class === "string" ? raw.card_class : undefined,
    card_country: typeof raw.card_country === "string" ? raw.card_country : undefined,
    raw,
  };
}

export type PayAnytimeResult = {
  ok: boolean;
  status: "PAY_SUCCESS" | "PAYING" | "PAY_FAIL" | "UNKNOWN";
  order_id?: string;
  raw: GpResp;
};

export async function payAnytime(args: {
  clientOrderId: string;
  memberToken: string;
  description: string;
  priceJpy: number;
  extra: Record<string, string>;
}): Promise<PayAnytimeResult> {
  if (getGlobePayMode() === "mock") {
    return {
      ok: true,
      status: "PAY_SUCCESS",
      order_id: `mock_order_${args.clientOrderId}`,
      raw: {
        return_code: "SUCCESS",
        result_code: "SUCCESS",
        order_id: `mock_order_${args.clientOrderId}`,
      },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const notifyUrl = requireEnv("GLOBEPAY_NOTIFY_URL");
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/card_orders/${args.clientOrderId}/pay_anytime`,
  );
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      member_token: args.memberToken,
      description: args.description,
      currency: "JPY",
      price: args.priceJpy,
      preauth: false,
      notify_url: notifyUrl,
      operator: "buyna-core",
      extra: args.extra,
    }),
  });
  const raw = (await res.json()) as GpResp;
  const ok = raw.return_code === "SUCCESS" && raw.result_code === "SUCCESS";
  return {
    ok,
    status: ok ? "PAY_SUCCESS" : "PAY_FAIL",
    order_id: typeof raw.order_id === "string" ? raw.order_id : undefined,
    raw,
  };
}

// ---- Hosted Credit Card (one-shot) ----

export type HostedCardResult = {
  pay_url: string;
  provider_order_id?: string;
  raw: GpResp;
};

/** Create a hosted credit-card pre-order and return the hosted checkout URL. */
export async function createHostedCardOrder(args: {
  clientOrderId: string;
  description: string;
  priceJpy: number;
  redirectUrl: string;
  extra: Record<string, string>;
}): Promise<HostedCardResult> {
  if (getGlobePayMode() === "mock") {
    // Mock: skip GlobePay, redirect straight to the return URL with a synthetic order id
    const mockOrderId = `mock_hc_${args.clientOrderId}`;
    return {
      pay_url: `${args.redirectUrl}${args.redirectUrl.includes("?") ? "&" : "?"}mock=1&provider_order_id=${encodeURIComponent(mockOrderId)}`,
      provider_order_id: mockOrderId,
      raw: { return_code: "SUCCESS", result_code: "SUCCESS", order_id: mockOrderId },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const notifyUrl = requireEnv("GLOBEPAY_NOTIFY_URL");
  // PUT /api/v1.0/gateway/partners/{partner_code}/pre_card_orders/{order_id}
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/pre_card_orders/${args.clientOrderId}`,
  );
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      description: args.description.slice(0, 64),
      currency: "JPY",
      price: args.priceJpy,
      preauth: false,
      notify_url: notifyUrl,
      redirect: args.redirectUrl,
      operator: "buyna-core",
      extra: args.extra,
    }),
  });
  const raw = (await res.json()) as GpResp;
  if (raw.return_code !== "SUCCESS" || raw.result_code !== "SUCCESS") {
    throw new Error(`GlobePay pre_card_orders failed: ${JSON.stringify(raw)}`);
  }
  let payUrl = typeof raw.pay_url === "string" ? raw.pay_url : "";
  if (!payUrl) {
    // Build the hosted card view URL ourselves with fresh signed params.
    const base = (process.env.GLOBEPAY_API_BASE_URL ?? "https://pay.globepay.co.jp").replace(
      /\/$/,
      "",
    );
    const { time, nonce_str, sign } = signedParams();
    const q = new URLSearchParams({ redirect: args.redirectUrl, time, nonce_str, sign });
    payUrl = `${base}/api/v1.0/channels/card/partners/${partnerCode}/gateway_orders/${args.clientOrderId}/view?${q.toString()}`;
  }
  return {
    pay_url: payUrl,
    provider_order_id: typeof raw.order_id === "string" ? raw.order_id : args.clientOrderId,
    raw,
  };
}

/** Query a hosted card / gateway order status. */
export async function queryOrderStatus(clientOrderId: string): Promise<{
  result_code: string;
  total_fee?: number;
  real_fee?: number;
  currency?: string;
  channel_order_id?: string;
  raw: GpResp;
}> {
  if (getGlobePayMode() === "mock") {
    return {
      result_code: "PAY_SUCCESS",
      raw: { return_code: "SUCCESS", result_code: "PAY_SUCCESS" },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const url = buildUrl(`/api/v1.0/gateway/partners/${partnerCode}/orders/${clientOrderId}`);
  const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  const raw = (await res.json()) as GpResp;
  return {
    result_code: typeof raw.result_code === "string" ? raw.result_code : "UNKNOWN",
    total_fee: typeof raw.total_fee === "number" ? raw.total_fee : undefined,
    real_fee: typeof raw.real_fee === "number" ? raw.real_fee : undefined,
    currency: typeof raw.currency === "string" ? raw.currency : undefined,
    channel_order_id: typeof raw.channel_order_id === "string" ? raw.channel_order_id : undefined,
    raw,
  };
}

// ================= WorldPay Recurring (subscriptions) =================
// Docs: https://pay.globepay.co.jp/docs/cn/#api-WorldPay_Recurring-RecurringPreOrder
// CIT (first): PUT /gateway/partners/{partner_code}/recurring/pre_orders/{client_order_id}
// Agreement query: GET /gateway/partners/{partner_code}/recurring/agreements/{merchant_agreement_id}
// MIT charge: PUT /gateway/partners/{partner_code}/recurring/agreements/{platform_agreement_id}/charges/{charge_id}
// Charge query: GET /gateway/partners/{partner_code}/recurring/agreements/{platform_agreement_id}/charges/{charge_id}

export type RecurringPlanCode = "BASIC" | "PRO";

export function recurringMonthlyPriceJpy(plan: RecurringPlanCode): number {
  return plan === "PRO" ? 4980 : 2980;
}

function recurringDescription(plan: RecurringPlanCode): string {
  return plan === "PRO"
    ? "Buyna.ai Pro monthly subscription"
    : "Buyna.ai Basic monthly subscription";
}

export type RecurringPreOrderResult = {
  pay_url: string;
  platform_agreement_id?: string;
  merchant_agreement_id: string;
  client_order_id: string;
  raw: GpResp;
};

/**
 * Create the first CIT recurring pre-order and return the hosted 3DS pay URL.
 * Do NOT include any setup fee here — this is the recurring monthly amount only.
 */
export async function createRecurringPreOrder(args: {
  plan: RecurringPlanCode;
  clientOrderId: string;
  merchantAgreementId: string;
  redirectUrl: string;
}): Promise<RecurringPreOrderResult> {
  const price = recurringMonthlyPriceJpy(args.plan);
  const description = recurringDescription(args.plan);

  if (getGlobePayMode() === "mock") {
    const mockPlatform = `mock_agr_${args.merchantAgreementId}`;
    return {
      pay_url: `${args.redirectUrl}${args.redirectUrl.includes("?") ? "&" : "?"}mock=1&merchant_agreement_id=${encodeURIComponent(args.merchantAgreementId)}`,
      platform_agreement_id: mockPlatform,
      merchant_agreement_id: args.merchantAgreementId,
      client_order_id: args.clientOrderId,
      raw: {
        return_code: "SUCCESS",
        result_code: "SUCCESS",
        platform_agreement_id: mockPlatform,
        merchant_agreement_id: args.merchantAgreementId,
      },
    };
  }

  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const notifyUrl = requireEnv("GLOBEPAY_NOTIFY_URL");
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/recurring/pre_orders/${args.clientOrderId}`,
  );
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      description,
      currency: "JPY",
      price,
      preauth: false,
      expire: "30m",
      notify_url: notifyUrl,
      redirect: args.redirectUrl,
      operator: "buyna-ai-subscription",
      agreement: {
        merchant_agreement_id: args.merchantAgreementId,
        type: "subscription",
        consumer_consent: true,
        recurring_end_date: "99991231",
        recurring_frequency: "30",
      },
    }),
  });
  const raw = (await res.json()) as GpResp;
  if (raw.return_code !== "SUCCESS" || raw.result_code !== "SUCCESS") {
    throw new Error(`GlobePay recurring pre_order failed: ${JSON.stringify(raw)}`);
  }
  return {
    pay_url: String(raw.pay_url ?? ""),
    platform_agreement_id:
      typeof raw.platform_agreement_id === "string" ? raw.platform_agreement_id : undefined,
    merchant_agreement_id:
      typeof raw.merchant_agreement_id === "string"
        ? raw.merchant_agreement_id
        : args.merchantAgreementId,
    client_order_id: args.clientOrderId,
    raw,
  };
}

export type RecurringAgreementStatus = "PENDING" | "ACTIVE" | "FAILED" | "UNKNOWN";

export async function queryRecurringAgreement(merchantAgreementId: string): Promise<{
  status: RecurringAgreementStatus;
  platform_agreement_id?: string;
  raw: GpResp;
}> {
  if (getGlobePayMode() === "mock") {
    return {
      status: "ACTIVE",
      platform_agreement_id: `mock_agr_${merchantAgreementId}`,
      raw: { return_code: "SUCCESS", result_code: "SUCCESS", status: "ACTIVE" },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/recurring/agreements/${merchantAgreementId}`,
  );
  const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  const raw = (await res.json()) as GpResp;
  const s = String(raw.status ?? "").toUpperCase();
  const status: RecurringAgreementStatus =
    s === "ACTIVE" || s === "PENDING" || s === "FAILED"
      ? (s as RecurringAgreementStatus)
      : "UNKNOWN";
  return {
    status,
    platform_agreement_id:
      typeof raw.platform_agreement_id === "string" ? raw.platform_agreement_id : undefined,
    raw,
  };
}

export type RecurringChargeResult = {
  ok: boolean;
  status: "PAY_SUCCESS" | "PAYING" | "PAY_FAIL" | "UNKNOWN";
  order_id?: string;
  raw: GpResp;
};

/** Create a merchant-initiated recurring charge (MIT) against an ACTIVE agreement. */
export async function createRecurringCharge(args: {
  plan: RecurringPlanCode;
  platformAgreementId: string;
  chargeId: string;
}): Promise<RecurringChargeResult> {
  const price = recurringMonthlyPriceJpy(args.plan);
  const description = recurringDescription(args.plan);

  if (getGlobePayMode() === "mock") {
    return {
      ok: true,
      status: "PAY_SUCCESS",
      order_id: `mock_charge_${args.chargeId}`,
      raw: { return_code: "SUCCESS", result_code: "SUCCESS" },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const notifyUrl = requireEnv("GLOBEPAY_NOTIFY_URL");
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/recurring/agreements/${args.platformAgreementId}/charges/${args.chargeId}`,
  );
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      description,
      currency: "JPY",
      price,
      preauth: false,
      expire: "30m",
      notify_url: notifyUrl,
      operator: "buyna-ai-subscription",
    }),
  });
  const raw = (await res.json()) as GpResp;
  const ok = raw.return_code === "SUCCESS" && raw.result_code === "SUCCESS";
  return {
    ok,
    status: ok ? "PAY_SUCCESS" : "PAY_FAIL",
    order_id: typeof raw.order_id === "string" ? raw.order_id : undefined,
    raw,
  };
}

/** Query the status of a recurring charge (only PAY_SUCCESS = paid). */
export async function queryRecurringCharge(args: {
  platformAgreementId: string;
  chargeId: string;
}): Promise<{
  result_code: string;
  raw: GpResp;
}> {
  if (getGlobePayMode() === "mock") {
    return {
      result_code: "PAY_SUCCESS",
      raw: { return_code: "SUCCESS", result_code: "PAY_SUCCESS" },
    };
  }
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const url = buildUrl(
    `/api/v1.0/gateway/partners/${partnerCode}/recurring/agreements/${args.platformAgreementId}/charges/${args.chargeId}`,
  );
  const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
  const raw = (await res.json()) as GpResp;
  return {
    result_code: typeof raw.result_code === "string" ? raw.result_code : "UNKNOWN",
    raw,
  };
}
