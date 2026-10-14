# Implementation and lifecycle

## Identity and install UX

Configure stable manifest id, name/short_name, start_url, scope, display, colors,
192/512 PNG icons and a separately composed maskable icon. Preserve approved logo
artwork. Include Apple touch icon where applicable. No tokens or account state in
metadata. Validate paths against the authorized origin/base path; root scope is
not a universal default for shared origins.

Feature-detect installation. Retain beforeinstallprompt where supported, call it
once from user action and handle dismissal. Detect standalone mode; otherwise
provide browser-specific instructions, including leaving an embedded browser when
necessary. Do not promise automatic iOS installation or identical session sharing.
Personal settings is a useful management-app entry point without granting admin
permissions; placement follows the current product, not a copied login-page button.

## Cache and authentication boundary

Use a project-scoped versioned namespace and explicit public asset allowlist.
Default to reviewed public icons/branding and a public offline document. Exclude
non-GET, cross-origin, query/signed URLs, auth/API, private/business HTML, documents,
attachments and upload/download endpoints from all persistent offline stores.
Fetch public precache assets without credentials; validate status, MIME, redirects
and version integrity before committing the candidate. SPA fallback HTML for an
image/worker is a validation failure. Remove only an incomplete candidate on error.

Use network-first navigation with public fallback on network failure; preserve
401/403 handling. Never replace authorization errors with an offline success page.
No offline order/payment/refund/upload queue by default. Revalidate authentication
on resume/reconnection with the existing auth adapter; network failure does not
prove authorization. Do not duplicate failed submissions or discard drafts.

## Updates and retirement

Revalidate worker/manifest/entry responses; hashed immutable assets can use long
cache lifetimes. Publish assets before references and entry wiring. Verify bytes,
headers and paths on the deployed origin. Reuse the approved resource/release flow.
Allow workers to wait. No default skipWaiting, forced reload or takeover of active
clients. Explain saving and closing app windows. Immediate updates require actual
application dirty/save/upload guards and multi-tab compatibility tests.

Prepare old entry/manifest versions, retained assets and a scoped retirement worker.
Verify current file versions before rollback to avoid overwriting another release.
Deleting sw.js alone does not retire existing clients. Cleanup depends on reconnect
and worker lifecycle; never promise instant removal or remote uninstall. Never
clear unrelated caches/registrations or business data.

## Reference evidence and platform sources

Reviewed on 2026-10-14: the APEX 2026-10-11 PWA release record covers public
installation, offline notice, waiting updates and scoped retirement. It defers
physical iPhone/Android install and real backend session-revocation E2E. Later task
work moves installation to personal settings and contains unfinished business work.
Reuse lifecycle patterns, not tenant values or blanket production-success claims.

Verify current browser behavior when implementing:
- [MDN installability](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [MDN install prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- [MDN caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [WebKit home-screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

Service workers provide this product's offline behavior but are not a universal
browser installation prerequisite. Push needs separate user permission,
subscription lifecycle, delivery service and verification.
