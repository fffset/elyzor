# Elyzor Architecture

## Purpose

Elyzor is designed as an **API Authentication Infrastructure Service** responsible for issuing, validating, and monitoring API access credentials.

The system separates authentication responsibility from application logic and provides a centralized trust authority for APIs.

---

## Architectural Goals

Elyzor is built around the following engineering principles:

* Stateless verification
* Low-latency request validation
* Secure secret handling
* Multi-tenant isolation
* Horizontal scalability
* Infrastructure simplicity (V1)

The initial architecture intentionally avoids premature microservice decomposition.

---

## System Context

Elyzor operates between external clients and protected APIs.

```
Client Application
        │
        │ API Request
        ▼
Protected API
        │
        │ Verification Request
        ▼
      Elyzor
        │
        ├── MongoDB
        └── Redis
```

Protected APIs delegate authentication decisions to Elyzor.

---

## High-Level Components

### 1. API Layer

Responsible for handling incoming HTTP requests.

Responsibilities:

* request validation
* authentication
* routing
* response normalization

Characteristics:

* stateless
* horizontally scalable
* container-ready

---

### 2. Authentication Module

Handles Elyzor account authentication.

Scope:

* user registration
* login
* JWT issuance
* session validation

This layer authenticates **platform users**, not API consumers.

---

### 3. Project Service

Implements tenant isolation.

Each user owns one or more projects.

```
User → Project → API Keys
```

Responsibilities:

* project ownership validation
* tenant boundary enforcement
* resource scoping

All downstream operations require project context.

---

### 4. API Key Service

Core credential management component.

Responsibilities:

* secure key generation
* hashing before persistence
* prefix identification
* lifecycle management
* revocation

#### Key Structure

```
sk_live_<public_part>.<secret_part>
```

Only hashed secrets are stored.

Plaintext keys are shown once during creation.

---

### 5. Verification Service (Core Engine)

The most performance-critical component.

Verification flow:

```
Incoming Verify Request
        │
Extract API Key
        │
Redis Lookup
        │
 ├── Cache Hit → Validate
 └── Cache Miss → Mongo Lookup
                     │
                Cache Result
```

Responsibilities:

* credential validation
* revocation check
* project resolution
* rate limit validation

Target latency:
< 5ms average verification time.

---

### 6. Usage Tracking Service

Records authentication events.

Captured metadata:

* project id
* api key id
* timestamp
* ip address
* request result

Usage data enables:

* analytics
* billing foundations
* abuse detection

Logging occurs asynchronously where possible.

---

## Data Storage Strategy

### MongoDB

Persistent storage.

Stores:

* users
* projects
* api keys (hashed)
* usage logs

Chosen for:

* flexible schema evolution
* rapid iteration
* developer familiarity

---

### Redis

Hot-path performance layer.

Used for:

* verification cache
* revoked key cache
* rate limiting counters

Redis prevents database access on every verification request.

---

## Request Verification Lifecycle

1. Client calls protected API.
2. Protected API extracts API key.
3. Protected API calls Elyzor `/v1/verify`.
4. Elyzor validates credential.
5. Elyzor returns authorization result.
6. Protected API continues execution.

Elyzor never directly proxies application traffic.

---

## Security Model

Elyzor follows a zero-trust design.

Security decisions:

* secrets never stored in plaintext
* constant-time hash comparison
* immediate revocation propagation
* scoped project access
* isolated tenant resources

Compromise of one project does not affect others.

---

## Scalability Model

### Horizontal Scaling

API layer remains stateless.

Scaling strategy:

```
Load Balancer
      │
 ┌────┴────┐
 │ Elyzor  │
 │ Elyzor  │
 │ Elyzor  │
 └────┬────┘
      │
 Redis Cluster
      │
 MongoDB
```

Additional instances can be added without coordination.

---

## Failure Strategy

### Redis Failure

Fallback to MongoDB lookup.

Performance degradation allowed.
Correctness preserved.

---

### Database Failure

Verification requests fail closed.

Access is denied rather than trusted.

---

## Future Evolution (Post-V1)

Planned architectural extensions:

* verification edge nodes
* event-driven usage pipeline
* billing service separation
* organization-level authorization
* SDK-based local verification

Microservices are introduced only when operational pressure justifies separation.

---

## Non-Goals (V1)

The following are intentionally excluded:

* OAuth provider support
* social login
* enterprise SSO
* identity federation
* session management for end users

Elyzor focuses strictly on **API authentication infrastructure**.

---

## Architectural Philosophy

Elyzor prioritizes correctness and clarity over abstraction.

Authentication systems fail primarily due to complexity.
V1 maintains a minimal surface area while preserving production realism.

The architecture is designed to evolve incrementally without requiring fundamental rewrites.
