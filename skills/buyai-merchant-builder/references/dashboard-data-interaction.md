# Dashboard Data Interaction

Start this workflow only after the Dashboard UI source, mock interactions, API
contract, frontend checks, and user approval are complete.

## Development Sequence

1. Lock the approved Dashboard routes, visible fields, actions, states, and API
   contract.
2. Establish the server/API boundary and environment configuration without
   changing the approved frontend framework.
3. Implement merchant login, session, authorization, and single-merchant
   ownership.
4. Implement the AWS database schema and reversible migrations.
5. Implement S3 storage when the approved UI contains image/file actions.
6. Implement real APIs and business rules for the approved Dashboard pages.
7. Replace each mock adapter with the corresponding real API without
   redesigning the page.
8. Verify loading, empty, validation, success, error, permission, refresh, and
   persistence behavior.
9. Verify that approved merchant changes appear on the public website.

For product merchants, cover the approved pages in this order:

1. 仪表盘
2. 商品管理
3. 分类管理
4. 订单
5. 付费客户
6. 支付设置

## Required Boundaries

- Keep business rules and credentials on the server.
- Use the approved AWS database for structured business data and S3 for files.
- Do not introduce Supabase, Lovable, a platform administrator, or
  multi-merchant behavior.
- Do not replace mock adapters until the corresponding endpoint and error
  behavior are implemented and verified.
- Do not silently change approved Dashboard UI. Return contract/UI conflicts
  for focused user approval.
- Do not mark payment paid from the browser or redirect alone.

## Delivery Record

For each completed interaction slice, report:

- frontend adapter files changed;
- backend endpoint/service files changed;
- schema/migration or S3 files changed;
- tests and commands run;
- persistence and refresh evidence;
- remaining mock or unconnected behavior.

Complete one page or closely related interaction slice at a time. Stop for
approval before starting the next slice.
