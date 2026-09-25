/** @type {import('jest').Config} */
const base = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }] },
  testEnvironment: 'node',
};

module.exports = {
  projects: [
    // Reglas de negocio puras: no necesitan base de datos.
    { ...base, displayName: 'unit', rootDir: 'src', testRegex: '.*\\.spec\\.ts$' },
    // API completa contra PostgreSQL real (TEST_DATABASE_URL).
    { ...base, displayName: 'e2e', rootDir: 'test', testRegex: '.*\\.e2e-spec\\.ts$', testTimeout: 30000 },
  ],
};
