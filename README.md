# CloudNative DevOps Platform

Node.js API → GitHub Actions (test, build, Trivy scan) → Amazon ECR → Helm chart → Argo CD (GitOps) → EKS,
provisioned with Terraform and monitored with Prometheus + Grafana. A Jenkinsfile is included as an alternative CI.

```
app/          Node.js API (/, /health, /metrics, /fail), tests, Dockerfile
.github/      CI/CD workflow
k8s/          Plain Kubernetes manifests (learning step before Helm)
helm/         Helm chart (values.yaml = local, values-prod.yaml = AWS, edited by CI)
terraform/    VPC, ECR, EKS, GitHub OIDC role
argocd/       Argo CD Application
monitoring/   Prometheus/Grafana values + alert rules
Jenkinsfile   Alternative CI pipeline
```

All commands below are for **Windows PowerShell** (run as a normal user unless stated).

---------------------------------------------------------------------
## STEP 0 – Install the tools (one time)

Use winget (built into Windows 10/11). Close and reopen PowerShell after installing.

```powershell
winget install --id Git.Git -e
winget install --id Docker.DockerDesktop -e
winget install --id Microsoft.VisualStudioCode -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Kubernetes.kubectl -e
winget install --id Helm.Helm -e
winget install --id Hashicorp.Terraform -e
winget install --id Amazon.AWSCLI -e
```

Verify:

```powershell
git --version; docker --version; node --version; npm --version
kubectl version --client; helm version; terraform version; aws --version
```

Start Docker Desktop, then enable Kubernetes: Settings → Kubernetes → Enable Kubernetes → Apply.
Check: `kubectl get nodes` shows one node `Ready`.

---------------------------------------------------------------------
## STEP 1 – Run the app locally

```powershell
cd cloudnative-devops-platform\app
npm install
npm test
npm start
```

In a second PowerShell window:

```powershell
Invoke-RestMethod http://localhost:8080/
Invoke-RestMethod http://localhost:8080/health
Invoke-WebRequest http://localhost:8080/metrics | Select-Object -ExpandProperty Content
```

Stop with Ctrl+C.

---------------------------------------------------------------------
## STEP 2 – Docker

```powershell
cd ..                                  # project root
docker build -t cloudnative-demo:1.0 ./app
docker run --rm -d --name cloudnative-demo -p 8080:8080 cloudnative-demo:1.0
docker ps
docker logs cloudnative-demo
Invoke-RestMethod http://localhost:8080/health
docker stop cloudnative-demo
```

---------------------------------------------------------------------
## STEP 3 – Push to GitHub and get CI green

1. Create an empty repo on github.com named `cloudnative-devops-platform` (no README).
2. In the project root:

```powershell
git init
git add .
git commit -m "Initial CloudNative DevOps Platform"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/cloudnative-devops-platform.git
git push -u origin main
```

3. Open the repo → **Actions**. The `test-and-scan` job should pass (tests, Docker build, Trivy).
   The publish job is skipped until Step 6 (that is expected).

If Trivy fails on a HIGH/CRITICAL finding, bump the base image or dependency, or adjust `severity` in `ci.yml`.

---------------------------------------------------------------------
## STEP 4 – Plain Kubernetes (local)

```powershell
kubectl apply -f k8s/deployment.yaml
kubectl get deployments,pods,services
kubectl port-forward service/cloudnative-demo 8080:80      # browse http://localhost:8080 (Ctrl+C to stop)
```

Practice scaling and self-healing:

```powershell
kubectl scale deployment cloudnative-demo --replicas=3
kubectl get pods
kubectl delete pod <POD_NAME>        # copy a name from `kubectl get pods`
kubectl get pods -w                  # a replacement appears
```

Clean up before moving to Helm (avoids name conflicts):

```powershell
kubectl delete -f k8s/deployment.yaml
```

---------------------------------------------------------------------
## STEP 5 – Helm (local)

```powershell
helm lint helm/cloudnative-demo
helm template cloudnative-demo helm/cloudnative-demo
helm upgrade --install cloudnative-demo helm/cloudnative-demo
kubectl get pods
kubectl port-forward service/cloudnative-demo 8080:80
```

Change replicas through Helm and observe the rollout:

```powershell
helm upgrade cloudnative-demo helm/cloudnative-demo --set replicaCount=3
kubectl rollout status deployment/cloudnative-demo
helm history cloudnative-demo
helm rollback cloudnative-demo 1           # practice rollback
```

---------------------------------------------------------------------
## STEP 6 – AWS with Terraform

> **Cost warning:** EKS control plane (~$0.10/hour) + 2 EC2 nodes + a NAT gateway cost real money
> (roughly $5–8/day). Create a budget alert in AWS Billing first, and run `terraform destroy` when done.

### 6.1 AWS account and CLI login
1. Create an AWS account, enable MFA on the root user, then create an IAM Identity Center user or an IAM user with
   administrator access for this learning project (never use root keys).
2. Configure the CLI:

```powershell
aws configure          # access key, secret, region (e.g. ap-south-1), output json
aws sts get-caller-identity
```

### 6.2 Provision
```powershell
cd terraform
Copy-Item terraform.tfvars.example terraform.tfvars
notepad terraform.tfvars                     # set github_repo and my_ip_cidr
Invoke-RestMethod https://checkip.amazonaws.com    # your public IP -> use  x.x.x.x/32

terraform init
terraform fmt
terraform validate
terraform plan
terraform apply                              # type yes; takes ~15 minutes
terraform output
```

### 6.3 Connect kubectl to EKS
```powershell
aws eks update-kubeconfig --region ap-south-1 --name cloudnative-demo-eks
kubectl get nodes                            # 2 nodes Ready
```

### 6.4 Wire GitHub Actions to AWS
1. Copy the `github_actions_role_arn` output.
2. GitHub repo → Settings → Secrets and variables → Actions → **Variables** → New variable:
   `AWS_ROLE_ARN` = that ARN.
3. If you used a region other than `ap-south-1`, edit `AWS_REGION` in `.github/workflows/ci.yml`.
4. Push any change. The `publish-and-update-gitops` job now builds, pushes the image to ECR and commits the new tag
   into `helm/cloudnative-demo/values-prod.yaml`.
5. Pull the bot commit: `git pull`.

---------------------------------------------------------------------
## STEP 7 – GitOps with Argo CD

```powershell
kubectl create namespace argocd
kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl get pods -n argocd -w                # wait until all are Running (Ctrl+C)
```

Get the admin password and open the UI:

```powershell
$pw = kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}"
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pw))
kubectl port-forward svc/argocd-server -n argocd 8081:443       # https://localhost:8081  user: admin
```

Edit `argocd/application.yaml` (set `repoURL` to your repo; a public repo needs no credentials), then:

```powershell
kubectl apply -f argocd/application.yaml
kubectl get applications -n argocd
kubectl get pods -n demo
```

**Prove GitOps works:** change `replicaCount` in `helm/cloudnative-demo/values-prod.yaml` from 2 to 3, commit and push.
Within ~3 minutes Argo CD syncs and you see 3 pods. Then change a line in `app/server.js`, push, and watch the
whole pipeline roll out the new image.

> If your repo is private, add it in Argo CD UI → Settings → Repositories with a GitHub token.
> The ECR image pull works on EKS because the node IAM role already includes ECR read access.

---------------------------------------------------------------------
## STEP 8 – Monitoring (Prometheus + Grafana)

Install the stack with release name **`monitoring`** (the ServiceMonitor label depends on this):

```powershell
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack `
  -n monitoring --create-namespace -f monitoring/kube-prometheus-values.yaml
kubectl get pods -n monitoring -w
```

Apply alert rules (the app's ServiceMonitor is created by the chart because `values-prod.yaml` enables it):

```powershell
kubectl apply -n monitoring -f monitoring/alerts.yaml
```

Open Grafana and Prometheus:

```powershell
kubectl port-forward svc/monitoring-grafana -n monitoring 3000:80            # http://localhost:3000  admin / change-me-now
kubectl port-forward svc/monitoring-kube-prometheus-prometheus -n monitoring 9090:9090   # http://localhost:9090
```

Prometheus → Status → Targets should list the `cloudnative-demo` endpoints as UP.

Useful queries (Grafana → Explore):

| Panel | PromQL |
|---|---|
| Request rate | `sum(rate(http_requests_total[1m]))` |
| Error rate | `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))` |
| p95 latency | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` |
| Pod restarts | `kube_pod_container_status_restarts_total{pod=~"cloudnative-demo.*"}` |
| Memory | `container_memory_working_set_bytes{pod=~"cloudnative-demo.*"}` |

Grafana also ships ready-made Kubernetes dashboards (Dashboards → Browse).

### Controlled failure test
```powershell
kubectl port-forward svc/cloudnative-demo -n demo 8082:80
# in a second window: generate errors for a few minutes
1..400 | ForEach-Object { try { Invoke-WebRequest http://localhost:8082/fail -UseBasicParsing | Out-Null } catch {}; Start-Sleep -Milliseconds 300 }
```
Prometheus → Alerts: `HighErrorRate` goes Pending then Firing. Take screenshots for your portfolio.
Pod-kill test: `kubectl delete pod -n demo <POD_NAME>` and watch the dashboard.

---------------------------------------------------------------------
## STEP 9 – Jenkins (optional, alternative CI)

```powershell
docker run -d --name jenkins -p 8085:8080 -p 50000:50000 -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts-jdk17
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Open http://localhost:8085, paste the password, install suggested plugins. Then:
1. Add credentials of kind *AWS Credentials* with ID `aws-creds`.
2. Jenkins needs Node, Docker CLI, Trivy and AWS CLI available on the agent (easiest: run Jenkins on a Linux VM and install them).
3. New Item → Multibranch Pipeline → point to your GitHub repo; it picks up `Jenkinsfile`.

Do not let Jenkins and GitHub Actions both deploy the same app. Use Jenkins on a branch or a fork to demo it.

---------------------------------------------------------------------
## STEP 10 – Clean up (important, avoids AWS bills)

```powershell
kubectl delete -f argocd/application.yaml          # stops Argo CD from re-creating things
helm uninstall monitoring -n monitoring
cd terraform
terraform destroy                                  # type yes; confirm in the AWS console that EKS, NAT gateway and EC2 are gone
```

---------------------------------------------------------------------
## Troubleshooting

| Problem | Fix |
|---|---|
| `ImagePullBackOff` locally | Image must exist in Docker Desktop: re-run `docker build -t cloudnative-demo:1.0 ./app`; keep `pullPolicy: IfNotPresent` |
| `ImagePullBackOff` on EKS | `values-prod.yaml` still has the placeholder repository/tag; run CI once (Step 6.4) and `git pull` |
| CI publish job skipped | Repo variable `AWS_ROLE_ARN` not set, or branch isn't `main` |
| OIDC `Not authorized to perform sts:AssumeRoleWithWebIdentity` | `github_repo` in `terraform.tfvars` must exactly match `owner/repo` |
| `kubectl` can't reach EKS | Your IP changed; update `my_ip_cidr` and `terraform apply` |
| ServiceMonitor not created / CRD error | Install monitoring (Step 8) before enabling `serviceMonitor`, or let Argo CD retry |
| Target missing in Prometheus | Helm release for the stack must be named `monitoring`, or change `releaseLabel` |
| Argo CD stuck OutOfSync | Check `repoURL`, the path `helm/cloudnative-demo`, and the app's Events in the UI |

## Resume bullets (use only what you actually completed)
- Built a CI/CD pipeline with GitHub Actions: automated tests, Docker build, Trivy scanning, and OIDC-authenticated pushes to Amazon ECR.
- Deployed to Amazon EKS with Helm and GitOps via Argo CD, with automated sync and self-healing.
- Provisioned VPC, EKS, ECR and IAM with Terraform.
- Instrumented a Node.js service with Prometheus metrics; built Grafana dashboards and alert rules, and validated them with controlled failure tests.
