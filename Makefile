# Pre-Shift Check PWA - Makefile
# ================================

.PHONY: help install dev build docker-build docker-push k8s-apply k8s-delete k8s-logs clean test

# Docker image configuration
IMAGE_PREFIX ?= pre-shift-check
SERVER_IMAGE ?= $(IMAGE_PREFIX)-server
CLIENT_IMAGE ?= $(IMAGE_PREFIX)-client
TAG ?= latest

# Kubernetes namespace
NAMESPACE ?= pre-shift-check

help:
	@echo "Pre-Shift Check PWA"
	@echo "==================="
	@echo ""
	@echo "Development:"
	@echo "  make install       - Install all dependencies"
	@echo "  make dev           - Run server and client in dev mode"
	@echo "  make dev-server    - Run only server in dev mode"
	@echo "  make dev-client    - Run only client in dev mode"
	@echo "  make build         - Build both server and client"
	@echo "  make test          - Run all tests"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build  - Build Docker images"
	@echo "  make docker-run    - Run with Docker Compose"
	@echo "  make docker-stop   - Stop Docker Compose"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make k8s-apply     - Deploy to Kubernetes"
	@echo "  make k8s-delete    - Remove from Kubernetes"
	@echo "  make k8s-logs      - View logs"
	@echo "  make k8s-status    - Show deployment status"
	@echo ""
	@echo "For mobile testing:"
	@echo "  make k8s-nodeport  - Deploy with NodePort (port 30080)"
	@echo ""

# ==========================================
# Development
# ==========================================

install:
	@echo "Installing server dependencies..."
	cd server && npm install
	@echo "Installing client dependencies..."
	cd client && npm install
	@echo "Done!"

dev:
	@echo "Starting development servers..."
	@echo "Server: http://localhost:3000"
	@echo "Client: http://localhost:4200"
	@echo ""
	@$(MAKE) -j2 dev-server dev-client

dev-server:
	cd server && npm run dev

dev-client:
	cd client && npm start -- --proxy-config proxy.conf.json

build:
	@echo "Building server..."
	cd server && npm run build
	@echo "Building client..."
	cd client && npm run build
	@echo "Build complete!"

test:
	@echo "Running server tests..."
	cd server && npm test || true
	@echo "Running client tests..."
	cd client && npm test -- --watch=false --browsers=ChromeHeadless || true

clean:
	rm -rf server/dist
	rm -rf client/dist
	rm -rf server/node_modules
	rm -rf client/node_modules

# ==========================================
# Docker
# ==========================================

docker-build:
	@echo "Building Docker images..."
	docker build -t $(SERVER_IMAGE):$(TAG) ./server
	docker build -t $(CLIENT_IMAGE):$(TAG) ./client
	@echo "Images built:"
	@echo "  - $(SERVER_IMAGE):$(TAG)"
	@echo "  - $(CLIENT_IMAGE):$(TAG)"

docker-run: docker-build
	docker compose up -d
	@echo ""
	@echo "Services running:"
	@echo "  - App: http://localhost:8080"
	@echo "  - API: http://localhost:8080/api"

docker-stop:
	docker compose down

docker-logs:
	docker compose logs -f

# ==========================================
# Kubernetes
# ==========================================

k8s-apply: docker-build
	@echo "Deploying to Kubernetes..."
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmap.yaml
	kubectl apply -f k8s/deployment.yaml
	kubectl apply -f k8s/service.yaml
	kubectl apply -f k8s/ingress.yaml
	@echo ""
	@echo "Deployment complete!"
	@echo "If using minikube, run: minikube tunnel"
	@echo "Then access: http://localhost"

k8s-nodeport: docker-build
	@echo "Deploying to Kubernetes with NodePort..."
	kubectl apply -f k8s/namespace.yaml
	kubectl apply -f k8s/configmap.yaml
	kubectl apply -f k8s/deployment.yaml
	kubectl apply -f k8s/service.yaml
	kubectl apply -f k8s/combined-deployment.yaml
	@echo ""
	@echo "Deployment complete!"
	@echo ""
	@echo "Access the app:"
	@echo "  - Minikube: http://$$(minikube ip):30080"
	@echo "  - Kind: http://localhost:30080 (after port-forward)"
	@echo "  - From phone: http://<YOUR_HOST_IP>:30080"
	@echo ""
	@echo "To find your host IP: hostname -I | awk '{print $$1}'"

k8s-delete:
	@echo "Removing from Kubernetes..."
	kubectl delete namespace $(NAMESPACE) --ignore-not-found=true
	@echo "Cleanup complete!"

k8s-logs:
	kubectl logs -f -l app=pre-shift-check -n $(NAMESPACE) --all-containers

k8s-status:
	@echo "=== Pods ==="
	kubectl get pods -n $(NAMESPACE)
	@echo ""
	@echo "=== Services ==="
	kubectl get svc -n $(NAMESPACE)
	@echo ""
	@echo "=== Ingress ==="
	kubectl get ingress -n $(NAMESPACE)

k8s-port-forward:
	@echo "Port forwarding to localhost:8080..."
	kubectl port-forward -n $(NAMESPACE) svc/pre-shift-check-combined 8080:80

# ==========================================
# Utilities
# ==========================================

qr-codes:
	@echo "QR Code URLs for assets:"
	@echo ""
	@echo "When running locally (dev):"
	@echo "  http://localhost:4200/pre-shift?asset_id=TRAC001"
	@echo "  http://localhost:4200/pre-shift?asset_id=TRAC002"
	@echo "  http://localhost:4200/pre-shift?asset_id=HARV001"
	@echo "  http://localhost:4200/pre-shift?asset_id=SPRY001"
	@echo ""
	@echo "When running in Kubernetes (NodePort):"
	@echo "  http://<HOST_IP>:30080/pre-shift?asset_id=TRAC001"
	@echo ""
	@echo "Generate QR codes at: https://www.qr-code-generator.com/"

