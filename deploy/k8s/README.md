# CareLink Kubernetes deployment

The production-style Kubernetes deployment uses MongoDB Atlas. MongoDB is not run inside this Kubernetes namespace.

## 1. Create the Atlas Secret outside Git

This repository is public, so never commit a live MongoDB password or connection string. The Deployment expects an unmanaged Secret named `carelink-atlas` with the key `MONGO_URI`.

```bash
kubectl create namespace carelink --dry-run=client -o yaml | kubectl apply -f -
read -s ATLAS_PASSWORD
kubectl -n carelink create secret generic carelink-atlas \
  --from-literal=MONGO_URI="mongodb+srv://txngjr:${ATLAS_PASSWORD}@cluster0.tha54x2.mongodb.net/carelink?retryWrites=true&w=majority" \
  --dry-run=client -o yaml | kubectl apply -f -
unset ATLAS_PASSWORD
```

If the Atlas password contains URI-reserved characters, URL-encode the password before building the connection string.

`atlas-secret.example.yaml` is documentation only and is intentionally not referenced by `kustomization.yaml`.

## 2. Allow the Kubernetes cluster in MongoDB Atlas

In Atlas, add the Kubernetes cluster's stable outbound/NAT public IP to the project's Network Access list. Prefer the specific egress IP rather than opening Atlas to all IPv4 addresses.

The namespace NetworkPolicy allows DNS plus outbound TCP/27017 so the application can resolve the `mongodb+srv` record and connect to Atlas.

## 3. Sync and verify

After the Secret exists, sync the Argo CD `carelink` application and verify the rollout:

```bash
kubectl -n carelink rollout status deployment/carelink --timeout=180s
kubectl -n carelink get pods
kubectl -n carelink logs deployment/carelink --tail=100
```

The application container runs as numeric UID/GID `1001:1001`, which satisfies Kubernetes `runAsNonRoot` validation.

## Existing in-cluster MongoDB data

Removing the StatefulSet from GitOps stops and prunes the in-cluster MongoDB workload. A PVC created by the old StatefulSet can remain after the StatefulSet is removed. Keep that PVC until any data you need has been migrated and verified in Atlas; delete it manually only when you are sure the old data is no longer needed.
