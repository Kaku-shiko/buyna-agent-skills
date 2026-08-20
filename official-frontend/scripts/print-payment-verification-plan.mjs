#!/usr/bin/env node

const args = process.argv.slice(2);
const amount = readArg("--amount") || "100";
const currency = (readArg("--currency") || "JPY").toUpperCase();
const strict = args.includes("--strict");
const failures = [];

function readArg(name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return args[index + 1] ?? "";
}

if (!["JPY", "CNY"].includes(currency)) {
  failures.push("Currency must be JPY or CNY for the current GlobePay verification plan.");
}

if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
  failures.push("Amount must be a positive number.");
}

console.log("Buyna.ai real payment verification plan");
console.log(
  "This command is read-only: it does not create orders, open checkout, or charge cards.",
);
console.log(`Suggested small test amount: ${amount} ${currency}`);

console.log("\nHard success boundaries");
console.log("- Provider order creation is not payment success.");
console.log("- Opening GlobePay checkout is not payment success.");
console.log("- Browser return/redirect is not payment success.");
console.log(
  "- One-time payment is paid only after verified notify/query returns result_code=PAY_SUCCESS.",
);
console.log("- Recurring agreement must be ACTIVE before later MIT charges.");
console.log(
  "- Recurring monthly charge is paid only after query/notify returns result_code=PAY_SUCCESS.",
);
console.log("- Paid/refunded audit records must remain visible and must not be deleted.");

console.log("\n1. One-time payment proof");
console.log("1. Confirm production env and GlobePay dashboard checks have passed.");
console.log("2. Start one small hosted-card or enabled payment method checkout.");
console.log("3. Record only masked local order id and masked provider order reference.");
console.log("4. Wait for verified notify, or run the server-side provider query fallback.");
console.log("5. Confirm provider result_code=PAY_SUCCESS.");
console.log("6. Confirm local status changed to paid only after verified notify/query.");
console.log("7. Confirm admin/seller paid record is visible.");
console.log("8. Confirm CSV or dashboard totals use the same verified paid record.");

console.log("\nEvidence fields for paymentVerification.oneTime");
console.log("- tested: true");
console.log("- checkedAt: current timestamp");
console.log(`- amount: ${amount}`);
console.log(`- currency: ${currency}`);
console.log("- providerOrderIdRef: masked provider/dashboard reference");
console.log("- resultCode: PAY_SUCCESS");
console.log("- localStatus: paid");
console.log("- notifyOrQueryVerified: true");
console.log("- paidRecordVisibleInAdmin: true");
console.log("- csvVerified: true");

console.log("\n2. Recurring subscription proof");
console.log(
  "1. Confirm WorldPay Recurring and Hosted 3DS are enabled for the production partner code.",
);
console.log("2. Start one small subscription authorization.");
console.log("3. Complete the first customer-initiated hosted 3DS checkout.");
console.log("4. Query/verify agreement status and record only a masked agreement reference.");
console.log("5. Confirm agreementStatus=ACTIVE before any later MIT charge.");
console.log("6. Verify the first charge result_code=PAY_SUCCESS through recurring notify/query.");
console.log("7. Confirm admin subscription and charge records are visible.");
console.log("8. Confirm CSV/admin totals use verified recurring records.");

console.log("\nEvidence fields for paymentVerification.recurring");
console.log("- tested: true");
console.log("- checkedAt: current timestamp");
console.log(`- amount: ${amount}`);
console.log(`- currency: ${currency}`);
console.log("- agreementRef: masked provider/dashboard reference");
console.log("- hosted3dsCompleted: true");
console.log("- agreementStatus: ACTIVE");
console.log("- firstChargeResultCode: PAY_SUCCESS");
console.log("- recurringNotifyVerified: true");
console.log("- adminSubscriptionVisible: true");
console.log("- csvOrAdminTotalsVerified: true");

console.log("\nDo not record");
console.log("- Raw card data");
console.log("- Customer PII");
console.log("- GlobePay credential_code");
console.log("- Raw webhook payloads");
console.log("- Unmasked provider/customer identifiers");

console.log("\nFinal gate");
console.log("After recording masked proof in .production-evidence.json:");
console.log("pnpm run check:prod-evidence");
console.log("pnpm run audit:goal:strict");

if (strict && failures.length) {
  console.error("\nFailures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
