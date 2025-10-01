const { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.AWS_REGION
});

const s3Client = new S3Client({
    region: process.env.AWS_REGION
});

/**
 * Post-Confirmation Lambda Trigger
 * Automatically assigns tenant information to users after they confirm their email
 * and uploads the travel policy file to S3 under the tenant's prefix
 */
exports.handler = async (event) => {
    console.log('Post-confirmation trigger event:', JSON.stringify(event, null, 2));
    
    const { userPoolId, userName, request } = event;
    const userAttributes = request.userAttributes;
    
    try {
        // Extract user information for tenant assignment logic
        const email = userAttributes.email;
        
        // Tenant assignment logic - extract from email alias
        let tenantId = 'DEFAULT';
        let tenantTier = 'basic';
        
        // Extract tenant ID from email alias (e.g., test+tenant1@test.com -> tenant1)
        if (email && email.includes('+')) {
            const emailParts = email.split('@')[0]; // Get part before @
            const aliasParts = emailParts.split('+'); // Split by +
            if (aliasParts.length > 1 && aliasParts[1].trim()) {
                tenantId = aliasParts[1].trim();
                tenantTier = 'standard'; // Default tier for alias-based assignment
            }
        }
        
        // Fallback: Generate unique tenant ID if no alias provided
        if (tenantId === 'DEFAULT') {
            const timestamp = Date.now().toString(36);
            const randomStr = Math.random().toString(36).substring(2, 8);
            tenantId = `TENANT_${timestamp}_${randomStr}`.toUpperCase();
        }
        
        console.log(`Assigning tenant - User: ${userName}, Email: ${email}, TenantId: ${tenantId}, TenantTier: ${tenantTier}`);
        
        // Update user attributes with tenant information
        const updateParams = {
            UserPoolId: userPoolId,
            Username: userName,
            UserAttributes: [
                {
                    Name: 'custom:tenantId',
                    Value: tenantId
                },
                {
                    Name: 'custom:tenantTier',
                    Value: tenantTier
                }
            ]
        };
        
        const command = new AdminUpdateUserAttributesCommand(updateParams);
        await cognitoClient.send(command);
        
        console.log(`Successfully assigned tenant attributes to user ${userName}`);
        
        // Upload sample files to S3 under tenant prefix
        if (process.env.POLICY_BUCKET_NAME) {
            await uploadSampleFiles(tenantId);
        } else {
            console.warn('POLICY_BUCKET_NAME environment variable not set, skipping S3 upload');
        }
        
        // Optional: Log to CloudWatch for monitoring
        console.log('TENANT_ASSIGNMENT', {
            userId: userName,
            email: email,
            tenantId: tenantId,
            tenantTier: tenantTier,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error assigning tenant attributes:', error);
        
        // Important: Don't throw error here as it would prevent user confirmation
        // Instead, log the error and potentially send to a dead letter queue
        console.error('TENANT_ASSIGNMENT_FAILED', {
            userId: userName,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        
        // You might want to send this to SQS for retry or manual processing
        // await sendToRetryQueue({ userName, userPoolId, error: error.message });
    }
    
    // Always return the event to continue the Cognito flow
    return event;
};

/**
 * Upload sample files to S3 under tenant prefix
 */
async function uploadSampleFiles(tenantId) {
    try {
        const templatesDir = path.join(__dirname, 'templates');
        const templateFiles = fs.readdirSync(templatesDir);

        console.log(`Found ${templateFiles.length} template files to upload:`, templateFiles);

        for (const filename of templateFiles) {
            // Skip hidden files and directories
            if (filename.startsWith('.')) continue;

            const templatePath = path.join(templatesDir, filename);

            // Skip if it's a directory
            if (!fs.statSync(templatePath).isFile()) continue;

            // Read template file content
            let fileContent = fs.readFileSync(templatePath, 'utf8');

            // Replace {{TENANT}} placeholder with actual tenant ID
            fileContent = fileContent.replace(/{{TENANT}}/g, tenantId);

            // Determine content type based on file extension
            let contentType = 'text/plain';
            if (filename.endsWith('.json')) {
                contentType = 'application/json';
            } else if (filename.endsWith('.md')) {
                contentType = 'text/markdown';
            }

            // Upload to S3 under tenant prefix
            const s3Key = `${tenantId}/${filename}`;

            const uploadParams = {
                Bucket: process.env.POLICY_BUCKET_NAME,
                Key: s3Key,
                Body: fileContent,
                ContentType: contentType,
                ServerSideEncryption: 'AES256'
            };

            const uploadCommand = new PutObjectCommand(uploadParams);
            await s3Client.send(uploadCommand);

            console.log(`Successfully uploaded ${filename} to S3: s3://${process.env.POLICY_BUCKET_NAME}/${s3Key}`);
        }

    } catch (error) {
        console.error('Error uploading sample files to S3:', error);
        // Don't throw error to avoid breaking user confirmation flow
    }
}
