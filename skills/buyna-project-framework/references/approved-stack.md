# Framework Selection Baseline

Use the customer's approved requirements and existing project as the source of truth.

For a new project with no approved stack, compare a small set of suitable options and record the decision before implementation:

- Frontend: React/Next.js, Vue/Nuxt, or another justified framework.
- Backend: framework-native server routes, FastAPI, NestJS, Django/DRF, or another justified backend.
- Structured data: private PostgreSQL on AWS RDS/Aurora by default when AWS is selected.
- Files/images: Amazon S3; add CloudFront when delivery requirements justify it.
- Authentication: server-enforced sessions or tokens according to the application boundary.
- Payments: server-only provider adapter and verified webhook/query status.
- Secrets: AWS Secrets Manager, SSM, or protected server environment variables.
- Deployment: choose after inspecting runtime needs; do not assume static hosting.

Record runtime versions, build/start commands, migration tooling, environments, and approved exceptions. Never silently replace a working framework.
