import config from './env-config.js';
import packageInfo from '../package.json' with { type: 'json'};

interface MetadataInfo {
    version: string;
    taskId?: string;
}

async function initializeMetadata(): Promise<MetadataInfo> {
    const data: MetadataInfo = { version: packageInfo.version };
    
    const ecsMetadataUri = config.get('ECS_CONTAINER_METADATA_URI_V4');
    if (ecsMetadataUri) {
        try {
            const response = await fetch(`${ecsMetadataUri}/task`);
            const taskData = await response.json();
            data.taskId = taskData.TaskARN.split(':')[5];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn('Failed to fetch ECS metadata:', message);
        }
    }
    
    return data;
}

export const metadata = await initializeMetadata();
