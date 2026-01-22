#!/bin/bash
set -e

# Configuration
AWS_ACCOUNT_ID="569061878514"
AWS_REGION="eu-west-1"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
TAG="${1:-latest}"
NAMESPACE="pre-shift-check"
PROJECT_DIR="/home/michael/fieldin/pre-shift-check-pwa"

echo "🚀 Deploying Pre-Shift Check PWA to Kubernetes"
echo "================================================"
echo "Images:"
echo "  - Client: ${ECR_REGISTRY}/pre-shift-check-client:${TAG}"
echo "  - Server: ${ECR_REGISTRY}/pre-shift-check-server:${TAG}"
echo ""

cd ${PROJECT_DIR}

# Step 1: Build client
if [[ "$2" != "--skip-build" ]]; then
    echo "📦 Step 1a: Building Angular client..."
    cd client
    npm install
    npm run build
    cd ..
    echo "✅ Client built"
    
    echo ""
    echo "📦 Step 1b: Building Node.js server..."
    cd server
    npm install
    npm run build
    cd ..
    echo "✅ Server built"
else
    echo "⏭️  Step 1: Skipping build (--skip-build)"
fi

# Step 2: Login to ECR
echo ""
echo "🔐 Step 2: Logging in to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_REGISTRY}
echo "✅ Logged in"

# Step 3: Create ECR repositories if they don't exist
echo ""
echo "📁 Step 3: Ensuring ECR repositories exist..."
aws ecr describe-repositories --repository-names pre-shift-check-client --region ${AWS_REGION} 2>/dev/null || \
    aws ecr create-repository --repository-name pre-shift-check-client --region ${AWS_REGION}
aws ecr describe-repositories --repository-names pre-shift-check-server --region ${AWS_REGION} 2>/dev/null || \
    aws ecr create-repository --repository-name pre-shift-check-server --region ${AWS_REGION}
echo "✅ Repositories ready"

# Step 4: Build Docker images
echo ""
echo "🐳 Step 4: Building Docker images..."
docker buildx build --platform linux/amd64 --load \
    -t ${ECR_REGISTRY}/pre-shift-check-client:${TAG} \
    -f client/Dockerfile client/
echo "✅ Client image built"

docker buildx build --platform linux/amd64 --load \
    -t ${ECR_REGISTRY}/pre-shift-check-server:${TAG} \
    -f server/Dockerfile server/
echo "✅ Server image built"

# Step 5: Push images
echo ""
echo "📤 Step 5: Pushing images to ECR..."
docker push ${ECR_REGISTRY}/pre-shift-check-client:${TAG}
docker push ${ECR_REGISTRY}/pre-shift-check-server:${TAG}
echo "✅ Images pushed"

# Step 6: Apply Kubernetes manifests
echo ""
echo "🎯 Step 6: Applying Kubernetes manifests..."
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
echo "✅ Manifests applied"

# Step 7: Restart deployment
echo ""
echo "🔄 Step 7: Rolling out new deployment..."
kubectl rollout restart deployment/pre-shift-check -n ${NAMESPACE}

# Step 8: Wait for rollout
echo ""
echo "⏳ Step 8: Waiting for rollout to complete..."
kubectl rollout status deployment/pre-shift-check -n ${NAMESPACE} --timeout=180s

# Step 9: Wait for ALB health check
echo ""
echo "⏳ Step 9: Waiting for ALB health check (30s)..."
sleep 30

# Step 10: Verify deployment
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Pod status:"
kubectl get pods -n ${NAMESPACE}

echo ""
echo "🔗 Services:"
kubectl get svc -n ${NAMESPACE}

echo ""
echo "🌐 Public URL: http://pre-shift-check.dev.fieldintech.com"
echo ""

# Health check
echo "🩺 Health check:"
curl -s --max-time 10 http://pre-shift-check.dev.fieldintech.com/api/status || echo "⚠️  Health check failed - ALB may still be registering targets"
echo ""

