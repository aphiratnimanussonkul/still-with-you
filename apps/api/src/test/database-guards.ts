import postgres from 'postgres';

/**
 * Database safety guards for tests
 * Prevents accidental truncation of production databases
 */

const ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'db', 'postgres'];
const ALLOWED_DATABASES = ['swy_test', 'postgres', 'test'];
const FORBIDDEN_PATTERNS = ['supabase.co', 'pooler.supabase.com'];

export async function guardTestDatabase(connectionString: string): Promise<void> {
  // 1. NODE_ENV must be test
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Test database operations are only allowed when NODE_ENV=test');
  }

  // 2. Must use TEST_DATABASE_URL, not DATABASE_URL in production
  if (!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL) {
    throw new Error(
      'Tests must use TEST_DATABASE_URL environment variable, not DATABASE_URL'
    );
  }

  // 3. Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (connectionString.includes(pattern)) {
      throw new Error(
        `Test database connection string contains forbidden pattern: ${pattern}. ` +
          'Tests must not connect to hosted Supabase databases.'
      );
    }
  }

  // 4. Parse and check host
  let parsedHost: string;
  try {
    // Extract host from connection string
    const url = new URL(connectionString.replace('postgresql://', 'http://'));
    parsedHost = url.hostname;
  } catch {
    throw new Error('Invalid database connection string format');
  }

  if (!ALLOWED_HOSTS.includes(parsedHost)) {
    throw new Error(
      `Test database host "${parsedHost}" is not in the allowed list: ${ALLOWED_HOSTS.join(', ')}`
    );
  }

  // 5. Connect and verify current_database()
  const testSql = postgres(connectionString, { max: 1 });

  try {
    const [result] = await testSql<{ current_database: string }[]>`SELECT current_database()`;
    const dbName = result.current_database;

    if (!ALLOWED_DATABASES.includes(dbName)) {
      throw new Error(
        `Connected database "${dbName}" is not in the allowed list: ${ALLOWED_DATABASES.join(', ')}. ` +
          'Refusing to truncate.'
      );
    }
  } finally {
    await testSql.end();
  }
}
