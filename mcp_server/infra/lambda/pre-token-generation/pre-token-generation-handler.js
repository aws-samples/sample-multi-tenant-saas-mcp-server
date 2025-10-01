exports.handler = async (event) => {
    console.log('Pre Token Generation event:', JSON.stringify(event, null, 2));
    const userAttributes = event.request.userAttributes;

    event.response = {
        "claimsAndScopeOverrideDetails": {
          "accessTokenGeneration": {
            "claimsToAddOrOverride": {
                'custom:tenantId': userAttributes['custom:tenantId'] || '',
                'custom:tenantTier': userAttributes['custom:tenantTier'] || ''
            }
          }
        }
      };

    return event;
};
