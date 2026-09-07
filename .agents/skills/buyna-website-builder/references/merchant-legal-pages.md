# Merchant privacy and transaction disclosures

This is a reusable delivery checklist for all website types, not a blanket legal
opinion or a ready-to-publish policy. Verify the merchant jurisdiction, customers,
transaction model and current official guidance before producing the final text.
For Japanese commerce, use the consumer-facing title
「特定商取引法に基づく表記」. Do not confuse this with a privacy policy.

## Intake and ownership

Record applicability and unresolved questions in the existing intake/acceptance
records; do not add an independent approval flag or bypass workflow gates.
Collect public merchant facts in project content configuration: legal/trading name,
responsible person where applicable, business address, contact details and hours.
Separate public business details from non-public owner identity documents and
credentials. Use only this merchant's supplied/verified facts.

Inventory actual forms, accounts, orders, bookings, analytics and cookies; record
what personal data is collected, for which purposes, who handles it (including
payment/hosting providers), actual retention/deletion practice, applicable sharing
or overseas transfers, and contact/rights request procedures. Do not claim that
no data is shared while processors or analytics receive it. Do not invent blanket
consent checkboxes; determine appropriate notices/consent for the actual handling.

Collect the actual price/tax presentation, additional costs, payment methods and
timing, delivery/service timing, application limits, and cancellation/refund rules
needed for the merchant's transaction model. Check the applicable disclosure
requirements against the official sources below; this list is an intake aid, not
an exhaustive statement of law.

## Business-specific content

- Content: privacy follows real data use; do not invent sales or shipping terms.
- Commerce: reflect shipping areas/timing/costs, return conditions, defective goods
  handling and refunds. No default universal return period or no-refunds clause.
- Service: reflect booking date/time, rescheduling, merchant/customer cancellation,
  no-shows, prepaid versus on-site payment, and refundable amounts/deadlines.
  Service cancellation is not a physical-goods return workflow.
- Mixed: distinguish the conditions for products and services. Subscription or
  recurring offers need their own actual renewal and cancellation disclosures.

## Build and verification

Use project-owned structured content and one shared renderer for policy pages;
keep merchant facts/policy versions outside presentation components. Reuse that
content in relevant confirmation screens to avoid contradictory prices or terms.
Existing frontend/content modules handle rendering; do not invent a legal engine
or claim a legal core is in the repository manifest.

Include readable, stable privacy and applicable disclosure page routes. Provide
clear footer links, relevant data-collection notices, and transaction disclosures
accessible from the offer/checkout/booking flow. A footer alone does not establish
that final confirmation requirements are met. Check both desktop and mobile.

Test that routes and links work, this merchant's facts appear, placeholders and
other merchants' data do not, and displayed costs/timing/cancellation/refund rules
match implemented checkout, settlement and booking behavior. Save page/version
and verification evidence with the existing frontend/testing deliverables.
Missing facts can remain visibly unresolved in preview. Do not mark the affected
publication requirements ready until resolved through the existing review flow.

## Official references (checked 2026-09-08; recheck when drafting)

- Consumer Affairs Agency, mail-order transactions:
  https://www.no-trouble.caa.go.jp/what/mailorder/
- Advertising disclosures and accessible links:
  https://www.no-trouble.caa.go.jp/what/mailorder/advertising.html
- Return conditions and final confirmation guidance:
  https://www.no-trouble.caa.go.jp/what/mailorder/guidelines.html
- Personal Information Protection Commission, general guidelines:
  https://www.ppc.go.jp/personalinfo/legal/guidelines_tsusoku/
