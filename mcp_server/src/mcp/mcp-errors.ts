interface JsonRpcError {
    jsonrpc: '2.0';
    error: {
        code: number;
        message: string;
    };
    id: null;
}

function build(code: number, message: string): JsonRpcError {
    return {
        jsonrpc: '2.0',
        error: {
            code,
            message,
        },
        id: null,
    };
}


export default {
    get internalServerError(): JsonRpcError {
        return build(-32603, 'Internal Server Error');
    },

    get noValidSessionId(): JsonRpcError {
        return build(-32000, 'No valid session ID');
    },

    get invalidOrMissingSessionId(): JsonRpcError {
        return build(-32000, 'Invalid or missing session ID');
    },

    get methodNotAllowed(): JsonRpcError {
        return build(-32000, 'Method not allowed');
    },

    get invalidToken(): JsonRpcError {
        return build(-32001, 'Authentication failed: Invalid or expired token');
    },

    get tokenVerificationFailed(): JsonRpcError {
        return build(-32002, 'Authentication failed: Token verification error');
    },
    
    get missingToken(): JsonRpcError {
        return build(-32003, 'Authentication failed: No authorization token provided');
    },
    
    get invalidAuthFormat(): JsonRpcError {
        return build(-32004, 'Authentication failed: Invalid authorization format');
    },
    
    get emptyToken(): JsonRpcError {
        return build(-32005, 'Authentication failed: Empty token provided');
    }

}