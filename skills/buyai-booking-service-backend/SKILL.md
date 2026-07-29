---
name: buyai-booking-service-backend
description: "Build or repair Buyna.ai booking and service backends: services, availability, capacity, forms, deposits, GlobePay checkout, paid bookings, CSV, login, and seller admin."
---

# Buyai Booking Service Backend

Use for reservation sites: tours, lessons, salons, consulting, courses, travel, and packages. Owns services, availability, slots, capacity, forms, records, paid bookings, and seller backend. Do not model bookings as product stock unless truly simple.

## First Move

Read `references/booking-service-rules.md`. Confirm languages, currency, location/timezone, booking type, package rules, capacity model, and payment mode.

## Combine Skills

Use with `buyai-globepay-payment`, `buyai-checkout-address-ux`, `buyai-storefront-layout-ux`, and `aws-project-deployer` when AWS infrastructure or deployment is in scope.

## Gold

This skill does not own SKU inventory or GlobePay endpoints. It owns availability and capacity. Pending unpaid bookings may reserve capacity; expired/failed/cancelled release it; verified paid/deposit confirms it once.

## Required MVP

Seller backend: login, session, dashboard, service CRUD/archive, images, price/currency, duration/package, availability/capacity, records, paid bookings/customers, CSV, manual email, payment settings, GlobePay portal, optional platform shortcut, mobile layout.

Public site: service list/detail, booking form, date/time or preferred dates, participants, contact fields, notes, payment methods, verified confirmation, and shared footer.

## Status

Support full payment, deposit, or inquiry. Verify payment by backend notify/query only. Statuses include `pending_payment`, `confirmed`, `paid`, `deposit_paid`, `failed`, `expired`, `cancelled`, `completed`, `refunded`. Pages need filters, reset, pagination, URL params, timezone, and CSV.

## Validate

Check build, UTF-8, login, service CRUD sync, capacity editor, form storage, reserve/release, verified paid/deposit once, paid booking visibility, CSV, email, and mobile backend.
