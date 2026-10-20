# Learning path: Docker, Terraform, CI/CD, by hand

The golden rule: **do each thing manually first, then automate it.** You can't debug a pipeline for a deployment you've never done by hand.

Order: **Docker -> Terraform (infrastructure) -> manual deploy -> CI/CD**.

Each step has a goal, the concepts to learn, a "done when" check, and hints (not answers). If you get stuck, paste your file and the error into Claude and ask for an explanation or a review, not the solution.

---

## Before you touch AWS

- [ ] Create an **AWS Budget** alert (e.g. $10/month) and enable billing alerts. Do this first.
- [ ] Don't use the root user. Create an admin user via IAM Identity Center (or an IAM user with MFA) and use that with `aws configure sso` / `aws configure`.
- [ ] Install: Docker, Terraform (>= 1.10), AWS CLI v2, Git.
- [ ] Push this repo to GitHub (private or public).
- [ ] Habit: when you stop for the day, `terraform destroy`. NAT gateways, ALBs and RDS bill by the hour.

---

## Phase 1: Docker

### 1.1 Run Postgres in a container (no Dockerfile yet)
**Learn:** images vs containers, `docker run`, port mapping, environment variables, volumes.
**Task:** start `postgres:16-alpine` with the env vars the app expects, then run the backend locally against it.
**Done when:** `curl localhost:3000/health/db` returns `{"status":"ok","database":"up"}`.

### 1.2 Write a naive Dockerfile for the app
**Learn:** `FROM`, `WORKDIR`, `COPY`, `RUN`, `CMD`, build context, layer caching.
**Task:** a single-stage Dockerfile that builds the frontend, installs backend deps, and starts `node src/server.js`.
**Hints:**
- The frontend must be built (`npm run build`) before the backend can serve it. Set `STATIC_DIR` to wherever you copy `dist`.
- Copy `package*.json` and run `npm ci` **before** copying source, so dependency installs are cached.
- Add a `.dockerignore` (at minimum `node_modules`, `dist`, `.git`). Compare image size with and without it.

**Done when:** `docker build` works and the container serves the site on `localhost:3000`.

### 1.3 Make it production-grade
**Learn:** multi-stage builds, non-root users, `HEALTHCHECK`, build args, image size.
**Task, one at a time, measuring `docker images` after each:**
- [ ] Multi-stage: build the frontend in one stage, install **production-only** backend deps (`npm ci --omit=dev`) in another, copy only what's needed into the final stage.
- [ ] Run as a non-root user (the `node` image already ships a `node` user).
- [ ] Add a `HEALTHCHECK` hitting `/health` (alpine has `wget`, not `curl`).
- [ ] Pass `GIT_SHA` / `APP_VERSION` as build args and expose them as env vars; confirm `/api/info` shows them.
- [ ] Set `NODE_ENV=production`. Observe the app refuse to start without `JWT_SECRET`. Why is that a good behavior?

**Done when:** the image is well under ~200 MB, `docker exec <c> whoami` is not `root`, and `docker ps` shows `healthy`.

 

**Stretch:** scan your image with `docker scout` or `trivy image`. Fix or understand any HIGH findings.

---

## Phase 2: Terraform (build the platform in layers)

Work in a `terraform/` folder. Start with **local state**, apply and destroy often, and add one layer at a time. Run `terraform fmt` and `terraform validate` constantly.

Target architecture (draw this on paper first):

```
Internet -> ALB (public subnets) -> ECS Fargate tasks (private subnets) -> RDS (database subnets)
```

### 2.1 Provider, variables, and one resource
**Learn:** providers, `terraform init/plan/apply/destroy`, variables, outputs, state, `default_tags`.
**Task:** create a single S3 bucket. Read the plan output carefully. Apply. Look at `terraform.tfstate`. Destroy.
**Done when:** you can explain what the state file is for and why it must never be committed to Git.

### 2.2 Networking
**Learn:** VPC, subnets, route tables, internet gateway, NAT gateway, CIDR math, `count`, `cidrsubnet()`, data sources (`aws_availability_zones`).
**Task:** a VPC across 2 AZs with three subnet tiers: **public**, **private**, **database**. Public routes to the internet gateway; private routes through a NAT gateway; database has no internet route at all.
**Hints:** one NAT gateway is cheaper than one per AZ (what do you lose?). A free S3 gateway VPC endpoint avoids NAT charges for ECR layer pulls.
**Done when:** in the AWS console's VPC "Resource map" you can trace each tier's path to (or isolation from) the internet.

### 2.3 Security groups
**Learn:** stateful firewalls, referencing a security group as a source instead of a CIDR.
**Task:** ALB (80 from anywhere) -> app (3000 only from the ALB SG) -> database (5432 only from the app SG).
**Done when:** you can state, for each tier, exactly who can reach it and why nobody else can.

### 2.4 ECR
**Learn:** private registries, image scanning on push, lifecycle policies, tag immutability trade-offs.
**Task:** a repository with scan-on-push and a lifecycle policy that keeps the last N images.
**Do by hand now:** `aws ecr get-login-password | docker login ...`, then tag and `docker push` your image from your laptop. See the scan results in the console.

### 2.5 RDS
**Learn:** DB subnet groups, parameter choices, backups, Multi-AZ, storage autoscaling, Secrets Manager.
**Task:** PostgreSQL in the database subnets, **not** publicly accessible, encrypted.
**Hints:** look up `manage_master_user_password` so RDS generates and stores the password for you. Why is that better than a `password` variable? (Think: Terraform state.)
**Done when:** it's reachable from nothing except the app's security group.

### 2.6 Load balancer
**Learn:** ALB vs NLB, listeners, target groups, target type `ip` (required for Fargate), health checks, deregistration delay.
**Task:** an internet-facing ALB in the public subnets forwarding port 80 to a target group that health-checks `/health`.
**Optional:** HTTPS with an ACM certificate and an HTTP->HTTPS redirect (needs a domain).

### 2.7 IAM for ECS
**Learn:** the two ECS roles: **task execution role** (ECS agent: pull image, write logs, read secrets at start-up) vs **task role** (your running code's AWS permissions). Trust policies vs permission policies. Least privilege.
**Task:** create both; give the execution role access to *only* the secrets it needs.

### 2.8 ECS cluster, task definition, service
**Learn:** clusters, Fargate, task definitions (CPU/memory combos, `awsvpc` networking), container definitions, injecting `secrets` from Secrets Manager, CloudWatch log groups, service desired count, rolling deployments, the deployment circuit breaker, health-check grace period.
**Task:** run your image from ECR on Fargate in the private subnets, registered to the target group, with the DB settings and secrets injected.
**Debug practice (you will hit these):** tasks stopping immediately (read the "Stopped reason" in the console and the CloudWatch logs), image pull failures (NAT/endpoint/permissions?), failing health checks (security group? wrong path? slow start?), DB connection errors (SSL? security group?).
**Done when:** you open the ALB's DNS name in a browser, register an account and track time on a task.

### 2.9 Scaling and alarms
**Learn:** Application Auto Scaling, target tracking, scale-in vs scale-out cooldowns, CloudWatch alarms, SNS.
**Task:** autoscale 2-4 tasks on CPU; alarms for ALB 5xx, unhealthy hosts, RDS CPU and free storage, notifying an SNS topic.
**Test it:** generate load (`hey`, `ab` or a bash loop) and watch tasks scale out.

### 2.10 Remote state
**Learn:** why local state is dangerous, S3 backend, state locking (`use_lockfile` on Terraform >= 1.10), partial backend configuration.
**Task:** create a versioned, encrypted, private S3 bucket (in a **separate** small "bootstrap" config, or by hand), then migrate with `terraform init -migrate-state`.
**Done when:** `terraform.tfstate` is no longer on your disk and a second `apply` while one is running is blocked by the lock.

### Terraform stretch goals
- Split code into **modules** (network, database, service). When is a module worth it?
- `terraform import` an existing resource.
- Run `tflint` and `trivy config` / `checkov`; decide which findings to fix and which to accept (and document why).

---

## Phase 3: Deploy by hand (the dress rehearsal)

Before writing any pipeline, do the whole release manually so you know every step the pipeline will automate:

1. [ ] `docker build` with `GIT_SHA` set, tagged with the commit SHA.
2. [ ] Log in to ECR and `docker push`.
3. [ ] Get the current task definition: `aws ecs describe-task-definition`.
4. [ ] Register a new revision with the new image (`aws ecs register-task-definition`).
5. [ ] `aws ecs update-service` to the new revision.
6. [ ] `aws ecs wait services-stable`, then check `/api/info` for the new `gitSha`.
7. [ ] **Break it on purpose:** deploy an image that crashes on start. Watch the circuit breaker roll back. Read the service events.

Write down these commands. They become your pipeline.

---

## Phase 4: CI/CD with GitHub Actions

Build the pipeline in layers, committing after each so you can see each one work.

### 4.1 CI: tests on every push and PR
**Learn:** workflow syntax, triggers, jobs vs steps, `actions/checkout`, `actions/setup-node`, dependency caching, `concurrency`, least-privilege `permissions`.
**Task:** run backend tests, frontend tests and the frontend build.
**Done when:** a failing test turns the PR check red and blocks the merge (set up branch protection).

### 4.2 CI: build and scan the image
**Task:** build the Docker image in CI (with build cache), scan it with Trivy, and smoke-test it (hint: GitHub Actions **service containers** give you a Postgres next to your job).
**Think about:** which severity should fail the build? Why `ignore-unfixed`?

### 4.3 Authenticate to AWS with OIDC (no access keys!)
**Learn:** OIDC federation, the GitHub identity provider in IAM, trust policy conditions on the token's `aud` and `sub` claims, `id-token: write` permission, short-lived credentials.
**Task:**
- [ ] Create the IAM OIDC provider for `token.actions.githubusercontent.com`.
- [ ] Create a role whose trust policy only allows **your repo on the `main` branch**.
- [ ] Use `aws-actions/configure-aws-credentials` to assume it.
- [ ] Prove the restriction works: run the workflow from a different branch and watch the assume-role fail.

Why is this better than storing `AWS_ACCESS_KEY_ID` as a GitHub secret?

### 4.4 CD: push and deploy
**Task:** on merge to `main`: build, push to ECR tagged with the commit SHA, then roll out to ECS and wait for stability. Automate the commands you wrote in Phase 3 (look at `aws-actions/amazon-ecs-render-task-definition` and `amazon-ecs-deploy-task-definition`).
**Give the pipeline's IAM role the minimum**: ECR push on one repo, ECS update on one service, `iam:PassRole` for the two task roles only.
**Done when:** you change some UI text, merge, and watch it appear in production without touching your laptop.

### 4.5 Infrastructure pipeline
**Task:**
- [ ] On pull requests: `terraform fmt -check`, `validate`, and `plan`, with the plan posted as a PR comment (read-only role).
- [ ] On merge to `main`: `terraform apply`, gated by a **GitHub Environment** with a required reviewer.
**Learn:** why plan roles and apply roles should differ; how an `environment:` changes the OIDC `sub` claim to `repo:OWNER/REPO:environment:NAME`.

### CI/CD stretch goals
- Dependabot for npm, Docker, Actions and Terraform.
- Pin third-party actions to commit SHAs.
- A staging environment that deploys first.
- Notify a Slack/Discord channel on failed deploys.

---

## Phase 5: Make it portfolio-worthy

- [ ] **README** with an architecture diagram (Mermaid renders on GitHub), a "how to deploy" section, the cost estimate and a "design decisions" section. This is what recruiters read.
- [ ] Screenshots or a short screen recording of the app and of a pipeline run.
- [ ] A short "what I'd improve next" list (HTTPS, WAF, Multi-AZ DB, VPC flow logs, staging).
- [ ] Be ready to answer: *Why private subnets? Why Fargate over EC2? What happens if an AZ fails? How do secrets reach the container? How would you do a rollback? What does this cost and how would you reduce it?*

---

## How to use Claude while learning

Good prompts, in order of how much you learn:

1. "Explain what this error means" (paste the full error)
2. "Review my Terraform / Dockerfile / workflow: what's wrong or risky?"
3. "Why would you do X instead of Y here?"
4. "I'm stuck on step 2.8: give me a hint, not the answer."

Avoid: "write it for me": that's the part you're here to learn.
