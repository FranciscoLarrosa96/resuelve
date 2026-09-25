/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  testEnvironment: 'node',
};

module.exports = {
  // Los e2e usan PostgreSQL real: margen amplio para migraciones y seed.
  testTimeout: 30000,
  projects: [
    // Reglas de negocio puras: no necesitan base de datos.
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    // API completa contra PostgreSQL real (TEST_DATABASE_URL).
    { ...base, displayName: 'e2e', rootDir: 'test', testRegex: '.*\\.e2e-spec\\.ts$' },
  ],
};
