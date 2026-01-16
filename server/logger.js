'use strict';  

const pino = require('pino');  
const { trace } = require('@opentelemetry/api');  

const logger = pino({  
  level: process.env.LOG_LEVEL || 'info',  
  
  // Add base fields to all logs  
  base: {  
    service: 'foodme-api',  
    version: process.env.SERVICE_VERSION || '1.0.0',  
  },  
  
  transport: {  
    target: 'pino-loki',  
    options: {  
      batching: true,  
      interval: 10, // 10s for better batching in production  
      timeout: 30000, // 30s timeout  
      
      host: 'https://logs-prod-028.grafana.net', // ← Fixed: no path  
      
      basicAuth: {  
        username: process.env.GRAFANA_LOKI_USER,  
        password: process.env.GRAFANA_LOKI_API_KEY,  
      },  
      
      labels: {  
        service_name: 'foodme-api', // ← Critical: matches trace  
        app: 'foodme-api',  
        env: 'production',  
      },  
      
      // Retry failed pushes  
      retries: 3,  
      
      // Log errors to console if Loki push fails  
      silenceErrors: false,  
    },  
  },  
});  

function log(level, message, data = {}) {  
  const span = trace.getActiveSpan();  
  const spanContext = span?.spanContext();  
  
  const logData = {  
    ...data,  
    // Always include trace context (undefined if no active span)  
    trace_id: spanContext?.traceId || '',  
    span_id: spanContext?.spanId || '',  
    trace_flags: spanContext?.traceFlags || 0,  
  };  
  
  logger[level](logData, message);  
}  

// Also export raw logger for flexibility  
module.exports = {  
  info: (msg, data) => log('info', msg, data),  
  error: (msg, data) => log('error', msg, data),  
  warn: (msg, data) => log('warn', msg, data),  
  debug: (msg, data) => log('debug', msg, data),  
  
  // Raw logger access  
  logger,  
};  