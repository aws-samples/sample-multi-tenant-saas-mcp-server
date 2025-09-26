const TEMPLATE = {
    jsonrpc: '2.0',
    error: {
        code: 0,
        message: 'n/a',
    },
    id: null,
};

function build(code, message){
    const result = {...TEMPLATE};
    result.error.code = code;
    result.error.message = message;
    return result;
}


export default {
    get internalServerError(){
        return build(-32603, 'Internal Server Error');
    },

    get noValidSessionId(){
        return build(-32000, 'No valid session ID');
    },

    get invalidOrMissingSessionId(){
        return build(-32000, 'Invalid or missing session ID');
    },

    get methodNotAllowed(){
        return build(-32000, 'Method not allowed');
    },

    get invalidToken(){
        return build(-32001, 'Authentication failed: Invalid or expired token');
    },

    get tokenVerificationFailed(){
        return build(-32002, 'Authentication failed: Token verification error');
    },
    
    get missingToken(){
        return build(-32003, 'Authentication failed: No authorization token provided');
    },
    
    get invalidAuthFormat(){
        return build(-32004, 'Authentication failed: Invalid authorization format');
    },
    
    get emptyToken(){
        return build(-32005, 'Authentication failed: Empty token provided');
    }

}