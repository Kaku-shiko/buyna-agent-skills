# Merchant payment and subscription administration

Use `@buyna/merchant-access-core` for merchant profile, activation reporting and entitlement views. Buyna CRM is the administrative authority. Load current records through an authenticated, server-owned project and actor binding, never RAG or browser-supplied seller ownership.

Store channel activation, website configuration and provider verification separately. Merchant-confirmed activation is not provider transaction verification. Changing environment invalidates old confirmation. Administrative forms cannot assert provider verification or provider denial. Never store Partner Code or Credential Code in this record, index, logs or frontend source; use the protected credential adapter.

Keep platform Basic/Pro subscriptions distinct from a merchant's consumer subscriptions. Basic capacity is 524288000 bytes; Pro is 2147483648 bytes. Reporting capacity does not implement quota enforcement. Administrative enablement never proves the website has configured a working payment adapter. Renewal metadata never starts or cancels a provider agreement.

Write with optimistic revision checks and an atomic audit record. Merchants edit only legal name, business type, contact name and contact email; CRM administrators manage operational configuration. Bind each Builder project to exactly one CRM customer and owner actor. Never infer bindings from a similar company name. Refresh CRM records to read plan changes. Do not silently overwrite a record from another editor.
