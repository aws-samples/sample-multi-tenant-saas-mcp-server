import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_ENV_VARS = [
  'TABLE_NAME',
  'ROLE_ARN',
  'BUCKET_NAME',
  'COGNITO_USER_POOL_ID',
  'COGNITO_DOMAIN',
  'AWS_REGION',
  'PORT',
  'NODE_ENV',
  'ECS_CONTAINER_METADATA_URI_V4',
  'AUTHORIZATION_SERVER_WITH_DCR_URL',
  'DCR_ENABLED',
] as const;

type RequiredEnvVar = typeof REQUIRED_ENV_VARS[number];

export type EnvConfig = Record<RequiredEnvVar, string | undefined> & {
  get(varName: string): string | undefined;
  get(varName: string, defaultValue: string): string;
  has(varName: string): boolean;
};

function loadEnv(): EnvConfig {
  let envConfig: Record<string, string> = {};
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (fs.existsSync(envPath)) {
    try {
      const envFile = dotenv.parse(fs.readFileSync(envPath));
      envConfig = envFile;
      console.debug('Loaded environment variables from .env file');
    } catch (error) {
      console.warn('Error loading .env file:', (error as Error).message);
    }
  } else {
    console.debug('.env file not found, using only process environment variables');
  }

  const values: Partial<Record<RequiredEnvVar, string | undefined>> = {};
  for (const varName of REQUIRED_ENV_VARS) {
    values[varName] = process.env[varName] ?? envConfig[varName];
  }

  // Overloaded `get`: returns `string` when a default is provided, `string | undefined` otherwise.
  function get(varName: string): string | undefined;
  function get(varName: string, defaultValue: string): string;
  function get(varName: string, defaultValue?: string): string | undefined {
    return process.env[varName] ?? envConfig[varName] ?? defaultValue;
  }

  const config: EnvConfig = {
    ...(values as Record<RequiredEnvVar, string | undefined>),
    get,
    has(varName: string): boolean {
      return process.env[varName] !== undefined || envConfig[varName] !== undefined;
    },
  };

  return config;
}

const config = loadEnv();

export default config;
