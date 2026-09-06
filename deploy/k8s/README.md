# CareLink Kubernetes deployment

The Kubernetes deployment uses MongoDB Atlas. MongoDB is not run inside the Kubernetes namespace.

## MongoDB Atlas

The Atlas connection is deployed automatically by Argo CD from `atlas-secret.yaml` as the Kubernetes Secret `carelink-atlas`. The application reads `MONGO_URI` from that Secret.

The namespace NetworkPolicy allows DNS plus outbound TCP/27017 so the application can resolve the `mongodb+srv` record and connect to Atlas.

Make sure MongoDB Atlas Network Access allows the Kubernetes cluster's outbound/NAT public IP. For a classroom/demo environment, Atlas can also be configured with a broader temporary access rule if required by the environment.

## Sync and verify

Sync the Argo CD `carelink` application and verify the rollout:

```bash
kubectl -n carelink rollout status deployment/carelink --timeout=180s
kubectl -n carelink get pods
kubectl -n carelink logs deployment/carelink --tail=100
```

The application container runs as numeric UID/GID `1001:1001`, which satisfies Kubernetes `runAsNonRoot` validation.

## Existing in-cluster MongoDB data

The old in-cluster MongoDB StatefulSet and Service are no longer part of the Kustomization. Argo CD will prune those resources after this version is synced. A PVC created by the old StatefulSet may remain and can be deleted manually if the old demo data is no longer needed.
