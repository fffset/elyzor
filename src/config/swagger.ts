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
        description: 'Platform kullanıcıları için JWT access token',
      },
      apiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API Key',
        description: 'Doğrulama için sk_live_ prefix\'li API key',
      },
    },
    schemas: {
      // --- Auth ---
      RegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', minLength: 8, example: 'mysecret123' },
        },
      },
      RegisterResponse: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '64f1a...' },
              email: { type: 'string', example: 'user@example.com' },
            },
          },
          token: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
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
        properties: {
          accessToken: { type: 'string' },
        },
      },
      RefreshResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
        },
      },
      // --- Projects ---
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
      // --- API Keys ---
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
                description: 'Plaintext key — yalnızca bir kez gösterilir.',
                example: 'sk_live_abc123.xyz789',
              },
            },
          },
        ],
      },
      // --- Verification ---
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
      // --- Project Users ---
      ProjectUserRegisterRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', minLength: 8, maxLength: 128, example: 'mysecret123' },
        },
      },
      ProjectUserRegisterResponse: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '64f1b...' },
              email: { type: 'string', example: 'alice@example.com' },
              projectId: { type: 'string', example: '64f1a...' },
            },
          },
          accessToken: { type: 'string', description: 'Project user JWT (userType: project)' },
        },
      },
      ProjectUserLoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'alice@example.com' },
          password: { type: 'string', example: 'mysecret123' },
        },
      },
      ProjectUserLoginResponse: {
        type: 'object',
        properties: {
          accessToken: { type: 'string', description: 'Project user JWT (userType: project)' },
        },
      },
      // --- Errors ---
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
    },
  },
  paths: {
    // ── Auth ──────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Yeni hesap oluştur',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
        },
        responses: {
          201: {
            description: 'Hesap oluşturuldu. Refresh token HTTP-only cookie olarak set edilir.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterResponse' } } },
          },
          400: { description: 'Validation hatası', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Giriş yap',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          200: {
            description: 'Giriş başarılı. Refresh token HTTP-only cookie olarak set edilir.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } },
          },
          401: { description: 'Geçersiz kimlik bilgileri', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Access token yenile',
        description: 'HTTP-only cookie\'deki refresh token kullanılarak yeni access token üretilir.',
        responses: {
          200: { description: 'Yeni access token', content: { 'application/json': { schema: { $ref: '#/components/schemas/RefreshResponse' } } } },
          401: { description: 'Geçersiz veya süresi dolmuş refresh token', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Çıkış yap',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Çıkış başarılı' },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
    },
    '/auth/logout-all': {
      post: {
        tags: ['Auth'],
        summary: 'Tüm cihazlardan çıkış yap',
        security: [{ bearerAuth: [] }],
        responses: {
          204: { description: 'Tüm oturumlar sonlandırıldı' },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
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
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } },
          },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
      post: {
        tags: ['Projects'],
        summary: 'Yeni proje oluştur',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProjectRequest' } } },
        },
        responses: {
          201: { description: 'Proje oluşturuldu', content: { 'application/json': { schema: { $ref: '#/components/schemas/Project' } } } },
          400: { description: 'Validation hatası', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
    },
    '/projects/{id}': {
      delete: {
        tags: ['Projects'],
        summary: 'Projeyi sil',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          204: { description: 'Proje silindi' },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
          404: { description: 'Proje bulunamadı' },
        },
      },
    },
    // ── API Keys ──────────────────────────────────────────────────────────
    '/projects/{projectId}/keys': {
      get: {
        tags: ['API Keys'],
        summary: 'Projenin key\'lerini listele',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: {
            description: 'Key listesi',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/ApiKeyResponse' } } } },
          },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Yeni API key oluştur',
        description: 'Plaintext key yalnızca bu yanıtta döner — sonradan erişilemez.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateApiKeyRequest' } } },
        },
        responses: {
          201: { description: 'Key oluşturuldu', content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatedApiKeyResponse' } } } },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
        },
      },
    },
    '/projects/{projectId}/keys/{keyId}': {
      delete: {
        tags: ['API Keys'],
        summary: 'API key\'i iptal et (revoke)',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'projectId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'keyId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          204: { description: 'Key iptal edildi' },
          401: { description: 'Token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
          404: { description: 'Key bulunamadı' },
        },
      },
    },
    // ── Project Users ─────────────────────────────────────────────────────
    '/projects/{projectId}/auth/register': {
      post: {
        tags: ['Project Users'],
        summary: 'Proje kullanıcısı kayıt et',
        description: 'Platform kullanıcısı (XYZ Backend), kendi projesine yeni bir son kullanıcı ekler. alice gibi end user\'lar bu endpoint\'i doğrudan çağırmaz — XYZ Backend proxy\'ler.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectUserRegisterRequest' } } },
        },
        responses: {
          201: {
            description: 'Kullanıcı oluşturuldu. Refresh token HTTP-only cookie olarak set edilir.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectUserRegisterResponse' } } },
          },
          400: { description: 'Validation hatası', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } } },
          401: { description: 'Platform token gerekli', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
          404: { description: 'Proje bulunamadı' },
        },
      },
    },
    '/projects/{projectId}/auth/login': {
      post: {
        tags: ['Project Users'],
        summary: 'Proje kullanıcısı giriş yap',
        description: 'Platform kullanıcısı (XYZ Backend), bir son kullanıcının kimlik bilgilerini doğrular ve proje user token\'ı alır.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectUserLoginRequest' } } },
        },
        responses: {
          200: {
            description: 'Giriş başarılı. Refresh token HTTP-only cookie olarak set edilir.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectUserLoginResponse' } } },
          },
          401: { description: 'Geçersiz kimlik bilgileri veya platform token eksik', content: { 'application/json': { schema: { $ref: '#/components/schemas/UnauthorizedError' } } } },
          404: { description: 'Proje bulunamadı' },
        },
      },
    },
    // ── Verification ──────────────────────────────────────────────────────
    '/verify': {
      post: {
        tags: ['Verification'],
        summary: 'API key doğrula',
        description: 'Korunan API\'ler bu endpoint\'i çağırır. JWT gerekmez.',
        security: [{ apiKeyAuth: [] }],
        responses: {
          200: { description: 'Geçerli key', content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifySuccess' } } } },
          401: { description: 'Geçersiz key', content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyFailure' } } } },
          403: { description: 'İptal edilmiş key', content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyFailure' } } } },
          429: { description: 'Rate limit aşıldı', content: { 'application/json': { schema: { $ref: '#/components/schemas/VerifyFailure' } } } },
        },
      },
    },
  },
};

export const swaggerOptions: OAS3Options = {
  definition: swaggerDefinition,
  apis: [],
};
