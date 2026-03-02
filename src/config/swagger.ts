import type { OAS3Options } from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Elyzor API',
    version: '1.0.0',
    description: 'API key authentication as a service — issue, verify, and track API keys.',
  },
  servers: [{ url: '/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token',
      },
      apiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: "Doğrulama için sk_live_ prefix'li API key",
      },
      serviceKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'Service Key',
        description: "Servis doğrulama için svc_live_ prefix'li service key",
      },
    },
    schemas: {
      // ── Auth ────────────────────────────────────────────────────────────
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 128, example: 'mysecret123' },
        },
      },
      RegisterResponse: {
        type: 'object',
        description: "Refresh token HTTP-only cookie olarak set edilir, response body'de dönmez.",
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '64f1a...' },
              email: { type: 'string', example: 'user@example.com' },
            },
          },
          accessToken: {
            type: 'string',
            description: 'JWT access token (15 dakika geçerli)',
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', example: 'mysecret123' },
        },
      },
      LoginResponse: {
        type: 'object',
        description: 'Refresh token HTTP-only cookie olarak set edilir.',
        properties: {
          accessToken: {
            type: 'string',
            description: 'JWT access token (15 dakika geçerli)',
          },
        },
      },
      RefreshResponse: {
        type: 'object',
        description:
          'Eski refresh token revoke edilir, yeni token çifti verilir (rotation). Yeni refresh token HTTP-only cookie olarak set edilir.',
        properties: {
          accessToken: { type: 'string' },
        },
      },
      // ── Projects ────────────────────────────────────────────────────────
      CreateProjectRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', maxLength: 100, example: 'my-api' },
        },
      },
      Project: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '64f1a...' },
          name: { type: 'string', example: 'my-api' },
          userId: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      // ── API Keys ────────────────────────────────────────────────────────
      CreateApiKeyRequest: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 100, example: 'production' },
        },
      },
      ApiKeyResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          publicPart: { type: 'string' },
          label: { type: 'string' },
          revoked: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreatedApiKeyResponse: {
        allOf: [
          { $ref: '#/components/schemas/ApiKeyResponse' },
          {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Plaintext key — yalnızca bir kez gösterilir, sonradan erişilemez.',
                example: 'sk_live_abc123.xyz789',
              },
            },
          },
        ],
      },
      // ── Services ────────────────────────────────────────────────────────
      CreateServiceRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            maxLength: 100,
            pattern: '^[a-z0-9-]+$',
            example: 'billing-service',
            description: 'Yalnızca küçük harf, rakam ve tire',
          },
        },
      },
      ServiceResponse: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          projectId: { type: 'string' },
          name: { type: 'string', example: 'billing-service' },
          publicPart: { type: 'string' },
          revoked: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      CreatedServiceResponse: {
        allOf: [
          { $ref: '#/components/schemas/ServiceResponse' },
          {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Plaintext svc_live_ key — yalnızca bir kez gösterilir.',
                example: 'svc_live_abc123ef.xyz789secret',
              },
            },
          },
        ],
      },
      // ── Verification ────────────────────────────────────────────────────
      VerifySuccess: {
        type: 'object',
        properties: {
          valid: { type: 'boolean', example: true },
          projectId: { type: 'string', example: '64f1a...' },
          rateLimitRemaining: { type: 'number', example: 98 },
        },
      },
      VerifyFailure: {
        type: 'object',
        properties: {
          valid: { type: 'boolean', example: false },
          error: {
            type: 'string',
            enum: ['invalid_key', 'key_revoked', 'rate_limit_exceeded'],
          },
          retryAfter: { type: 'number', description: 'Yalnızca rate_limit_exceeded hatalarında' },
        },
      },
      VerifyServiceSuccess: {
        type: 'object',
        properties: {
          valid: { type: 'boolean', example: true },
          projectId: { type: 'string', example: '64f1a...' },
          service: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string', example: 'billing-service' },
            },
          },
          rateLimitRemaining: { type: 'number', example: 98 },
        },
      },
      VerifyServiceFailure: {
        type: 'object',
        properties: {
          valid: { type: 'boolean', example: false },
          error: {
            type: 'string',
            enum: ['invalid_key', 'service_revoked', 'rate_limit_exceeded'],
          },
          retryAfter: { type: 'number', description: 'Yalnızca rate_limit_exceeded hatalarında' },
        },
      },
      // ── Stats ───────────────────────────────────────────────────────────
      ProjectStatsResponse: {
        type: 'object',
        properties: {
          totalRequests: { type: 'number', example: 1204 },
          successRate: { type: 'number', example: 0.97, description: '0-1 arası oran' },
          topKeys: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                keyId: { type: 'string' },
                requests: { type: 'number' },
              },
            },
          },
          requestsByDay: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', example: '2026-03-01' },
                count: { type: 'number' },
                errors: { type: 'number' },
              },
            },
          },
          rateLimitHits: { type: 'number', example: 12 },
          avgLatencyMs: { type: 'number', example: 3.2 },
        },
      },
      // ── User ────────────────────────────────────────────────────────────
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '64f1a...' },
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      // ── Errors ──────────────────────────────────────────────────────────
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'validation_error' },
          message: { type: 'string', example: 'Geçerli bir email adresi giriniz' },
        },
      },
      UnauthorizedError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'unauthorized' },
          message: { type: 'string', example: 'Kimlik doğrulama gerekli' },
        },
      },
      ForbiddenError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'forbidden' },
          message: { type: 'string', example: 'Erişim reddedildi' },
        },
      },
      NotFoundError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'not_found' },
          message: { type: 'string', example: 'Bulunamadı' },
        },
      },
    },
  },
  paths: {
    // ── Auth ──────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Yeni platform hesabı oluştur',
        description:
          'Başarıyla kayıt olunca refresh token HTTP-only cookie olarak set edilir. Hata mesajları kullanıcı varlığını teyit etmez (enumeration koruması).',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Hesap oluşturuldu',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } },
            },
          },
          400: {
            description: 'Validation hatası',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Platform hesabına giriş yap',
        description: 'Başarıyla giriş yapılınca refresh token HTTP-only cookie olarak set edilir.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          200: {
            description: 'Giriş başarılı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
            },
          },
          400: {
            description: 'Validation hatası',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } },
            },
          },
          401: {
            description: 'Geçersiz kimlik bilgileri',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Access token yenile',
        description:
          "HTTP-only cookie'deki refresh token ile yeni access token alınır. Her çağrıda eski token revoke edilip yeni token çifti verilir (rotation). Revoke edilmiş token gelirse tüm oturumlar kapatılır (token theft detection).",
        responses: {
          200: {
            description: "Yeni token çifti. Yeni refresh token HTTP-only cookie'de.",
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/RefreshResponse' } },
            },
          },
          401: {
            description: 'Geçersiz veya süresi dolmuş refresh token',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Çıkış yap',
        description:
          "Access token Redis blacklist'e eklenir, refresh token silinir, cookie temizlenir.",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Çıkış başarılı' },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
    },
    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Tüm cihazlardan çıkış yap',
        description: "Kullanıcıya ait tüm refresh token'lar silinir.",
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Tüm oturumlar sonlandırıldı' },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Mevcut kullanıcı profilini getir',
        description: 'JWT token sahibinin email ve hesap bilgilerini döner.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Kullanıcı profili',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
    },
    // ── Projects ──────────────────────────────────────────────────────────
    '/projects': {
      get: {
        tags: ['Projects'],
        summary: 'Projeleri listele',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Proje listesi',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } },
              },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Yeni proje oluştur',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateProjectRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Proje oluşturuldu',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } },
          },
          400: {
            description: 'Validation hatası',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
        },
      },
    },
    '/projects/{id}': {
      delete: {
        tags: ['Projects'],
        summary: 'Projeyi sil',
        description:
          'Proje ve bağlı tüm API key, servis ve kullanım logları cascade olarak silinir.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          204: { description: 'Proje ve bağlı tüm veriler silindi' },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Bu projeye erişim yetkiniz yok',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Proje bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    // ── API Keys ──────────────────────────────────────────────────────────
    '/projects/{projectId}/keys': {
      get: {
        tags: ['API Keys'],
        summary: "Projenin key'lerini listele",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Key listesi',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKeyResponse' } },
              },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Bu projeye erişim yetkiniz yok',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Proje bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Yeni API key oluştur',
        description: 'Plaintext key yalnızca bu yanıtta döner — sonradan erişilemez.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Key oluşturuldu',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatedApiKeyResponse' },
              },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Bu projeye erişim yetkiniz yok',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Proje bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    '/projects/{projectId}/keys/{keyId}': {
      delete: {
        tags: ['API Keys'],
        summary: "API key'i iptal et (revoke)",
        description: "Revocation anlıktır — Redis verification cache'i temizlenir.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'keyId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          204: { description: 'Key iptal edildi' },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Bu projeye erişim yetkiniz yok veya key zaten iptal edilmiş',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Key bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    '/projects/{projectId}/keys/{keyId}/rotate': {
      post: {
        tags: ['API Keys'],
        summary: "API key'i rotate et",
        description:
          'Eski key revoke edilip yeni key üretilir. Aynı label korunur. Yeni plaintext key yalnızca bu yanıtta döner.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'keyId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          201: {
            description: 'Yeni key üretildi',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatedApiKeyResponse' },
              },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Key zaten iptal edilmiş',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Key bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    // ── Services ──────────────────────────────────────────────────────────
    '/projects/{projectId}/services': {
      get: {
        tags: ['Services'],
        summary: 'Proje servislerini listele',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Servis listesi',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ServiceResponse' } },
              },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          404: {
            description: 'Proje bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
      post: {
        tags: ['Services'],
        summary: 'Yeni servis kimliği oluştur',
        description: 'Plaintext svc_live_ key yalnızca bu yanıtta döner — sonradan erişilemez.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateServiceRequest' } },
          },
        },
        responses: {
          201: {
            description: 'Servis oluşturuldu',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatedServiceResponse' },
              },
            },
          },
          400: {
            description: 'Validation hatası veya servis adı zaten kullanımda',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          404: {
            description: 'Proje bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    '/projects/{projectId}/services/{serviceId}': {
      delete: {
        tags: ['Services'],
        summary: 'Servis kimliğini iptal et (revoke)',
        description: "Revocation anlıktır — Redis verification cache'i temizlenir.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          204: { description: 'Servis iptal edildi' },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Servis zaten iptal edilmiş',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Servis bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    '/projects/{projectId}/services/{serviceId}/rotate': {
      post: {
        tags: ['Services'],
        summary: 'Servis kimliğini rotate et',
        description:
          'Eski servis key revoke edilip yeni key üretilir. Servis adı korunur. Yeni plaintext svc_live_ key yalnızca bu yanıtta döner.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'serviceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          201: {
            description: 'Yeni servis key üretildi',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreatedServiceResponse' },
              },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          403: {
            description: 'Servis zaten iptal edilmiş',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ForbiddenError' } },
            },
          },
          404: {
            description: 'Servis bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    // ── Stats ──────────────────────────────────────────────────────────────
    '/projects/{projectId}/stats': {
      get: {
        tags: ['Stats'],
        summary: 'Proje kullanım istatistikleri',
        description:
          'Verification eventleri üzerinden aggregate sorgular çalıştırır. Dashboard real-time değildir.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'range',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['1d', '7d', '30d'], default: '7d' },
            description: 'İstatistik aralığı',
          },
        ],
        responses: {
          200: {
            description: 'İstatistik verisi',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/ProjectStatsResponse' } },
            },
          },
          401: {
            description: 'Token gerekli',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } },
            },
          },
          404: {
            description: 'Proje bulunamadı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/NotFoundError' } },
            },
          },
        },
      },
    },
    // ── Verification ──────────────────────────────────────────────────────
    '/verify': {
      post: {
        tags: ['Verification'],
        summary: 'API key doğrula (sk_live_)',
        description:
          "Korunan API'ler bu endpoint'i çağırır. JWT gerekmez — sk_live_ formatında API key gerektirir. Altyapı hatası durumunda fail-closed davranır (valid: false).",
        security: [{ apiKeyAuth: [] }],
        responses: {
          200: {
            description: 'Geçerli key',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifySuccess' } },
            },
          },
          401: {
            description: 'Geçersiz veya eksik key',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyFailure' } },
            },
          },
          403: {
            description: 'İptal edilmiş key',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyFailure' } },
            },
          },
          429: {
            description: 'Rate limit aşıldı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyFailure' } },
            },
          },
        },
      },
    },
    '/verify/service': {
      post: {
        tags: ['Verification'],
        summary: 'Service key doğrula (svc_live_)',
        description:
          "Microservice'ler arası doğrulama. JWT gerekmez — svc_live_ formatında service key gerektirir. sk_live_ key bu endpoint'te geçersizdir. Fail-closed davranır.",
        security: [{ serviceKeyAuth: [] }],
        responses: {
          200: {
            description: 'Geçerli service key',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyServiceSuccess' } },
            },
          },
          401: {
            description: 'Geçersiz veya eksik key',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyServiceFailure' } },
            },
          },
          403: {
            description: 'İptal edilmiş servis',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyServiceFailure' } },
            },
          },
          429: {
            description: 'Rate limit aşıldı',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/VerifyServiceFailure' } },
            },
          },
        },
      },
    },
    // ── Health ────────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Servis ve bağımlılık durumu',
        description: 'MongoDB ve Redis bağlantısını da kontrol eder. JWT veya API key gerektirmez.',
        responses: {
          200: {
            description: 'Tüm bağımlılıklar sağlıklı',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['ok', 'degraded'], example: 'ok' },
                    mongo: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
                    redis: { type: 'string', enum: ['ok', 'error'], example: 'ok' },
                  },
                },
              },
            },
          },
          503: {
            description: 'En az bir bağımlılık erişilemiyor',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'degraded' },
                    mongo: { type: 'string', example: 'error' },
                    redis: { type: 'string', example: 'ok' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const swaggerOptions: OAS3Options = {
  definition: swaggerDefinition,
  apis: [],
};
