module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    // Entrypoint ve infra dosyalari — unit test kapsamı dışında
    '!src/index.ts',
    '!src/cluster.ts',
    '!src/app.ts',
    '!src/config/db.ts',
    '!src/config/swagger.ts',
    // Router'lar integration testlerinde kapsamlanır
    '!src/**/*.router.ts',
    // Repository'ler ince DB wrapper'ları — integration testlerinde kapsamlanır
    '!src/**/*.repository.ts',
    // DTO siniflari — dekoratör tabanli, davranis yok
    '!src/**/dtos/*.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 75,
      lines: 80,
    },
  },
  testTimeout: 10000,
  // Modül-level ioredis instance'ı (mock'lu bile olsa) event loop'u açık tutar.
  // Unit testler tamamen mock'lu — gerçek bağlantı yok; forceExit güvenlidir.
  forceExit: true,
};
