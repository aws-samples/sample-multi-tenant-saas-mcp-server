import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
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
  
  const config: any = {};
  
  const requiredEnvVars = [
    'TABLE_NAME',
    'ROLE_ARN',
    'BUCKET_NAME',
    'COGNITO_USER_POOL_ID',
    'COGNITO_DOMAIN',
    'AWS_REGION',
    'PORT',
    'NODE_ENV',
    'ECS_CONTAINER_METADATA_URI_V4',
    'RESOURCE_SERVER_URL',
    'AUTHORIZATION_SERVER_WITH_DCR_URL',
    'DCR_ENABLED',
  ];
  
  requiredEnvVars.forEach(varName => {
    config[varName] = process.env[varName] !== undefined 
      ? process.env[varName] 
      : envConfig[varName];
  });
  
  config.get = function(varName: string, defaultValue?: string): string | undefined {
    return process.env[varName] !== undefined 
      ? process.env[varName] 
      : (envConfig[varName] !== undefined ? envConfig[varName] : defaultValue);
  };
  
  config.has = function(varName: string): boolean {
    return process.env[varName] !== undefined || envConfig[varName] !== undefined;
  };
  
  return config;
}

const config = loadEnv();
export default config;
