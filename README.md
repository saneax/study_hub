# Cloud & K8s Study Command Center (Cloudflare Pages + D1 + R2 + Workers AI)

A high-velocity study dashboard purpose-built for:
- **October 2026 Azure Sprint**: **AZ-104** (Microsoft Azure Administrator) & **AZ-305** (Designing Microsoft Azure Infrastructure Solutions)
- **Continuous Hands-On Track**: **CKA** (Certified Kubernetes Administrator) on Udemy + a local **3-Node `kubeadm` Kubernetes Cluster** (`cp-node-1`, `worker-node-1`, `worker-node-2`)

## Architecture & Cloudflare Bindings

1. **Cloudflare Pages + Pages Functions (`functions/api/[[route]].js`)**: Serves the single-page dashboard and serverless API routes at the edge.
2. **Cloudflare D1 (`env.DB`)**: Serverless SQLite database storing commitments/decisions, study session logs, course definitions, domain mastery metrics, Markdown notes, and hands-on lab completion states (`schema.sql`).
3. **Cloudflare R2 (`env.BUCKET`)**: Zero-egress object storage for uploading and retrieving Azure architecture diagrams, `kubeconfig` templates, Bicep/ARM files, and CKA YAML manifests.
4. **Cloudflare Workers AI (`env.AI`)**:
   - **Pre-Processing (`@cf/meta/llama-3.1-8b-instruct` + `@cf/baai/bge-base-en-v1.5`)**: Cleans raw terminal output/notes into structured Markdown, extracts exam tags, and generates 768-dim semantic embeddings prior to D1 insertion.
   - **Post-Processing (`@cf/meta/llama-3.1-8b-instruct`)**: Generates active-recall exam flashcards, `kubectl`/`az` verification commands, and personalized exam readiness audits across AZ-104, AZ-305, and CKA domains.

## Quick Deployment Steps

```bash
# 1. Authenticate Wrangler
npx wrangler login

# 2. Create the D1 Database & apply schema
npx wrangler d1 create study_command_center_db
# Copy the returned database_id into wrangler.toml, then initialize tables:
npx wrangler d1 execute study_command_center_db --remote --file=./schema.sql

# 3. Create the R2 Bucket for study assets & architecture diagrams
npx wrangler r2 bucket create study-hub-assets

# 4. Run locally with D1, R2, and Workers AI bindings
npx wrangler pages dev public --d1 DB=study_command_center_db --r2 BUCKET=study-hub-assets --ai AI

# 5. Deploy to Cloudflare Pages
npx wrangler pages deploy public --project-name azure-cka-study-hub
```
