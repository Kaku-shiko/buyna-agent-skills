import { createHash, randomBytes } from "crypto";

/**
 * GlobePay Japan WorldPay Recurring adapter (server-only).
 * Host: https://pay.globepay.co.jp/api/v1.0
 * Keep credential_code strictly server-side.
 */

type GpResp = { return_code: string; result_code?: string; [k: string]: unknown };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function baseUrl(): string {
  const raw = (
    process.env.GLOBEPAY_BASE_URL ??
    process.env.GLOBEPAY_API_BASE_URL ??
    "https://pay.globepay.co.jp/api/v1.0"
  ).replace(/\/$/, "");
  // ensure exactly one /api/v1.0 suffix
  return raw.endsWith("/api/v1.0") ? raw : `${raw}/api/v1.0`;
}

function signedQuery(): string {
  const partnerCode = requireEnv("GLOBEPAY_PARTNER_CODE");
  const credentialCode = requireEnv("GLOBEPAY_CREDENTIAL_CODE");
  const time = Date.now().toString();
  const nonce_str = randomBytes(12).toString("hex");
  const valid = `${partnerCode}&${time}&${nonce_str}&${credentialCode}`;
  const sign = createHash("sha256").update(valid, "utf8").digest("hex").toLowerCase();
  return new URLSearchParams({ time, nonce_str, sign }).toString();
}

export function partnerCode(): string {
  return requireEnv("GLOBEPAY_PARTNER_CODE");
}

export function isMock(): boolean {
  const mode = (process.env.GLOBEPAY_MODE ?? "mock").toLowerCase();
  return !(mode === "live" || mode === "real" || mode === "production" || mode === "prod");
}

/**
 * Verify recurring notify signature (partner_code&time&nonce_str&credential_code).
 * In mock mode we accept.
 */
export function verifyRecurringNotify(payload: Record<string, unknown>): boolean {
  if (isMock()) return true;
  const time = String(payload.time ?? "");
  const nonce_str = String(payload.nonce_str ?? "");
  const sign = String(payload.sign ?? "");
  if (!time || !nonce_str || !sign) return false;
  const partner = requireEnv("GLOBEPAY_PARTNER_CODE");
  const cred = requireEnv("GLOBEPAY_CREDENTIAL_CODE");
  const expected = createHash("sha256")
    .update(`${partner}&${time}&${nonce_str}&${cred}`, "utf8")
    .digest("hex")
    .toLowerCase();
  return expected === sign.toLowerCase();
}

// -------- Recurring Pre-Order (CIT) --------

export type CreateRecurringPreOrderArgs = {
  clientOrderId: string;
  merchantAgreementId: string;
  description: string;
  priceJpy: number;
  notifyUrl: string;
  redirectUrl: string;
  operator?: string;
};

export type RecurringPreOrderResult = {
  ok: boolean;
  pay_url: string;
  merchant_agreement_id: string;
  platform_agreement_id?: string;
  raw: GpResp;
};

export async function createRecurringPreOrder(
  a: CreateRecurringPreOrderArgs,
): Promise<RecurringPreOrderResult> {
  if (isMock()) {
    return {
      ok: true,
      pay_url: `${a.redirectUrl}${a.redirectUrl.includes("?") ? "&" : "?"}mock_agreement=${a.merchantAgreementId}`,
      merchant_agreement_id: a.merchantAgreementId,
      platform_agreement_id: `MOCK_PA_${a.merchantAgreementId}`,
      raw: { return_code: "SUCCESS", result_code: "SUCCESS", mock: true },
    };
  }
  const url = `${baseUrl()}/gateway/partners/${partnerCode()}/recurring/pre_orders/${a.clientOrderId}?${signedQuery()}`;
  const body = {
    description: a.description,
    currency: "JPY",
    price: a.priceJpy,
    preauth: false,
    expire: "30m",
    notify_url: a.notifyUrl,
    redirect: a.redirectUrl,
    operator: a.operator ?? "buyna-recurring",
    agreement: {
      merchant_agreement_id: a.merchantAgreementId,
      type: "subscription",
      consumer_consent: true,
      recurring_end_date: "99991231",
      recurring_frequency: 30,
    },
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = (await res.json()) as GpResp;
  const ok = raw.return_code === "SUCCESS";
  if (!ok) throw new Error(`GlobePay recurring pre_order failed: ${JSON.stringify(raw)}`);
  return {
    ok,
    pay_url: String(raw.pay_url ?? ""),
    merchant_agreement_id: String(raw.merchant_agreement_id ?? a.merchantAgreementId),
    platform_agreement_id: raw.platform_agreement_id
      ? String(raw.platform_agreement_id)
      : undefined,
    raw,
  };
}

// -------- Query Agreement --------

export type AgreementStatus = "PENDING" | "ACTIVE" | "FAILED" | "UNKNOWN";

export async function queryAgreement(merchantAgreementId: string): Promise<{
  status: AgreementStatus;
  platform_agreement_id?: string;
  raw: GpResp;
}> {
  if (isMock()) {
    return {
      status: "ACTIVE",
      platform_agreement_id: `MOCK_PA_${merchantAgreementId}`,
      raw: { return_code: "SUCCESS", result_code: "SUCCESS", status: "ACTIVE", mock: true },
    };
  }
  const url = `${baseUrl()}/gateway/partners/${partnerCode()}/recurring/agreements/${merchantAgreementId}?${signedQuery()}`;
  const res = await fetch(url, { method: "GET" });
  const raw = (await res.json()) as GpResp;
  if (raw.return_code && String(raw.return_code) !== "SUCCESS") {
    throw new Error(
      `GlobePay agreement query failed: ${String(raw.return_msg ?? raw.message ?? raw.return_code)} (${JSON.stringify(raw)})`,
    );
  }
  const rawStatus = String(
    raw.agreement_status ?? raw.status ?? raw.result_code ?? "",
  ).toUpperCase();
  const status: AgreementStatus =
    rawStatus === "ACTIVE" || rawStatus === "PENDING" || rawStatus === "FAILED"
      ? (rawStatus as AgreementStatus)
      : "UNKNOWN";
  return {
    status,
    platform_agreement_id: raw.platform_agreement_id
      ? String(raw.platform_agreement_id)
      : undefined,
    raw,
  };
}

// -------- MIT Charge --------

export type CreateChargeArgs = {
  platformAgreementId: string;
  chargeId: string;
  description: string;
  priceJpy: number;
  notifyUrl: string;
  operator?: string;
};

export async function createRecurringCharge(
  a: CreateChargeArgs,
): Promise<{ ok: boolean; raw: GpResp }> {
  if (isMock()) {
    return { ok: true, raw: { return_code: "SUCCESS", result_code: "SUCCESS", mock: true } };
  }
  const url = `${baseUrl()}/gateway/partners/${partnerCode()}/recurring/agreements/${a.platformAgreementId}/charges/${a.chargeId}?${signedQuery()}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      description: a.description,
      currency: "JPY",
      price: a.priceJpy,
      preauth: false,
      expire: "30m",
      notify_url: a.notifyUrl,
      operator: a.operator ?? "buyna-mit",
    }),
  });
  const raw = (await res.json()) as GpResp;
  return { ok: raw.return_code === "SUCCESS", raw };
}

export type ChargeStatus = "PAY_SUCCESS" | "PAYING" | "PAY_FAIL" | "UNKNOWN";

export async function queryRecurringCharge(
  platformAgreementId: string,
  chargeId: string,
): Promise<{ status: ChargeStatus; provider_order_id?: string; raw: GpResp }> {
  if (isMock()) {
    return {
      status: "PAY_SUCCESS",
      provider_order_id: `MOCK_ORD_${chargeId}`,
      raw: { return_code: "SUCCESS", result_code: "PAY_SUCCESS", mock: true },
    };
  }
  const url = `${baseUrl()}/gateway/partners/${partnerCode()}/recurring/agreements/${platformAgreementId}/charges/${chargeId}?${signedQuery()}`;
  const res = await fetch(url, { method: "GET" });
  const raw = (await res.json()) as GpResp;
  const rc = String(raw.result_code ?? "").toUpperCase();
  const status: ChargeStatus =
    rc === "PAY_SUCCESS" || rc === "PAYING" || rc === "PAY_FAIL" ? (rc as ChargeStatus) : "UNKNOWN";
  return {
    status,
    provider_order_id: raw.order_id ? String(raw.order_id) : undefined,
    raw,
  };
}

// -------- id helpers --------
function ymd(d = new Date()): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}
function rand(n = 6): string {
  return randomBytes(n).toString("hex");
}
export const genMerchantAgreementId = () => `BUYNA_AGR_${ymd()}_${rand(6)}`;
export const genRecurringClientOrderId = () => `BUYNA_RPO_${ymd()}_${rand(6)}`;
export const genRecurringChargeId = () => `BUYNA_CH_${ymd()}_${rand(6)}`;
