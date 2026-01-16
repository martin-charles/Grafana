'use strict';

const { logs } = require('@opentelemetry/api-logs');

const logger = logs.getLogger('foodme-test');

logger.emit({
  body: 'Hello from OTEL logs',
});

console.log('✅ OTEL log emitted');
