'use strict';  

const express = require('express');  
const bodyParser = require('body-parser');  
const fs = require('fs');  
const open = require('open').default;  

// ✅ Import your custom logger  
const log = require('./logger');  

const {  
  trace,  
  context,  
  SpanStatusCode,  
  metrics,  
} = require('@opentelemetry/api');  

const RestaurantRecord = require('./model').Restaurant;  
const MemoryStorage = require('./storage').Memory;  
const menuStore = require('./menuStore');  

const API_URL = '/api/restaurant';  
const API_URL_ID = `${API_URL}/:id`;  
const API_URL_ORDER = '/api/order';  

/**  
 * --------------------------------  
 * OpenTelemetry primitives  
 * --------------------------------  
 */  
const tracer = trace.getTracer('foodme-order');  
const meter = metrics.getMeter('foodme-metrics');  

const largeOrderCounter = meter.createCounter('orders.large', {  
  description: 'Number of large orders',  
});  

/**  
 * --------------------------------  
 * Helpers  
 * --------------------------------  
 */  
function removeMenuItems(restaurant) {  
  const clone = {};  
  Object.getOwnPropertyNames(restaurant).forEach((key) => {  
    if (key !== 'menuItems') clone[key] = restaurant[key];  
  });  
  return clone;  
}  

/**  
 * --------------------------------  
 * Request logging middleware (with trace correlation)  
 * --------------------------------  
 */  
function requestLogger(req, res, next) {  
  const start = Date.now();  
  
  res.on('finish', () => {  
    const duration = Date.now() - start;  
    const span = trace.getSpan(context.active());  
    const spanContext = span?.spanContext();  
    
    log.info('HTTP request', {  
      method: req.method,  
      url: req.url,  
      status: res.statusCode,  
      duration_ms: duration,  
      trace_id: spanContext?.traceId,  
      span_id: spanContext?.spanId,  
    });  
  });  
  
  next();  
}  

/**  
 * --------------------------------  
 * App bootstrap  
 * --------------------------------  
 */  
exports.start = function (PORT, STATIC_DIR, DATA_FILE, TEST_DIR) {  
  const app = express();  
  const storage = new MemoryStorage();  

  // Middleware  
  app.use(requestLogger); // ✅ Custom request logger with trace correlation  
  app.use(express.static(STATIC_DIR));  
  app.use(bodyParser.json());  
  app.use(bodyParser.urlencoded({ extended: true }));  

  /**  
   * --------------------------------  
   * RESTAURANTS  
   * --------------------------------  
   */  

  app.get(API_URL, (req, res) => {  
    log.info('Fetching restaurant list');  
    res.json(storage.getAll().map(removeMenuItems));  
  });  

  app.get(API_URL_ID, (req, res) => {  
    const restaurant = storage.getById(req.params.id);  

    if (!restaurant) {  
      log.warn('Restaurant not found', { restaurantId: req.params.id });  
      return res.status(404).json({ error: 'Restaurant not found' });  
    }  

    restaurant.menuItems = menuStore.getMenuForRestaurant(restaurant);  

    log.info('Fetched restaurant with menu', {  
      restaurantId: req.params.id,  
      menuItemCount: restaurant.menuItems.length,  
    });  

    res.json(restaurant);  
  });  

  /**  
   * --------------------------------  
   * ORDER  
   * --------------------------------  
   */  
  app.post(API_URL_ORDER, (req, res) => {  
    tracer.startActiveSpan('process.order', (span) => {  
      try {  
        const order = req.body || {};  

        if (!Array.isArray(order.items) || order.items.length === 0) {  
          const err = new Error('items[] is required');  
          span.recordException(err);  
          span.setStatus({ code: SpanStatusCode.ERROR });  

          log.warn('Order validation failed', { order });  
          span.end();  
          return res.status(400).json({ error: err.message });  
        }  

        let itemCount = 0;  
        let orderTotal = 0;  

        /**  
         * -----------------------------  
         * SAFE NUMERIC CALCULATION  
         * -----------------------------  
         */  
        for (const item of order.items) {  
          const qty = Number(item.qty);  
          const price = Number(item.price);  

          if (!Number.isFinite(qty) || !Number.isFinite(price)) {  
            const err = new Error('Invalid item qty or price');  
            span.recordException(err);  
            span.setStatus({ code: SpanStatusCode.ERROR });  

            log.error('Invalid order item data', { item });  
            span.end();  
            return res.status(400).json({ error: err.message });  
          }  

          itemCount += qty;  
          orderTotal += qty * price;  
        }  

        // Normalize floating-point precision  
        orderTotal = Number(orderTotal.toFixed(2));  

        // Set span attributes  
        span.setAttribute('itemCount', Number(itemCount));  
        span.setAttribute('orderTotal', Number(orderTotal));  

        /**  
         * --------------------------------  
         * USE CASE 1: Inventory out-of-stock  
         * --------------------------------  
         */  
        const INVENTORY_FAILURE_RATE = 0.20;  
        const availableStock = 5;  

        if (Math.random() < INVENTORY_FAILURE_RATE && itemCount > availableStock) {  
          const err = new Error('Insufficient inventory');  

          span.recordException(err);  
          span.setStatus({ code: SpanStatusCode.ERROR });  
          span.setAttribute('error.type', 'business');  
          span.setAttribute('inventory.available', availableStock);  
          span.setAttribute('inventory.requested', itemCount);  

          log.warn('Order rejected due to insufficient inventory', {  
            itemCount,  
            availableStock,  
            orderTotal,  
          });  

          span.end();  
          return res.status(409).json({  
            error: err.message,  
            availableStock,  
          });  
        }  

        /**  
         * --------------------------------  
         * USE CASE 2: Downstream dependency timeout  
         * --------------------------------  
         */  
        const DEPENDENCY_FAILURE_RATE = 0.15;  

        if (Math.random() < DEPENDENCY_FAILURE_RATE) {  
          const err = new Error('Inventory service timeout');  

          span.recordException(err);  
          span.setStatus({ code: SpanStatusCode.ERROR });  
          span.setAttribute('error.type', 'dependency');  
          span.setAttribute('dependency.name', 'inventory-service');  
          span.setAttribute('dependency.timeout_ms', 3000);  

          log.error('Inventory service timeout', {  
            itemCount,  
            orderTotal,  
          });  

          span.end();  
          return res.status(502).json({  
            error: err.message,  
          });  
        }  

        /**  
         * -----------------------------  
         * BUSINESS LOGIC  
         * -----------------------------  
         */  

        // Large order metric  
        if (itemCount > 8) {  
          largeOrderCounter.add(1, { type: 'large' });  
          log.info('Large order detected', { itemCount });  
        }  

        // Simulated slowness  
        if (Math.random() < 0.2) {  
          log.info('Simulating slow external dependency');  
          Atomics.wait(  
            new Int32Array(new SharedArrayBuffer(4)),  
            0,  
            0,  
            3000  
          );  
        }  

        // Order limit check  
        if (itemCount > 11) {  
          const err = new Error('Too many items');  
          span.recordException(err);  
          span.setStatus({ code: SpanStatusCode.ERROR });  

          log.error('Order rejected: too many items', { itemCount });  

          span.end();  
          return res.status(400).json({ error: err.message });  
        }  

        const orderId = Date.now();  

        log.info('Order successfully placed', {  
          orderId,  
          itemCount,  
          orderTotal,  
          restaurant: order.restaurant,  
        });  

        span.end();  
        res.json({  
          orderId,  
          total: orderTotal,  
          status: 'PLACED',  
        });  
      } catch (err) {  
        span.recordException(err);  
        span.setStatus({ code: SpanStatusCode.ERROR });  

        log.error('Unexpected error while processing order', {  
          error: err.message,  
          stack: err.stack,  
        });  

        span.end();  
        res.status(500).json({ error: err.message });  
      }  
    });  
  });  

  /**  
   * --------------------------------  
   * PAYMENT (FAKE GATEWAY)  
   * --------------------------------  
   */  
  app.post('/api/payment', (req, res) => {  
    tracer.startActiveSpan('process.payment', (span) => {  
      try {  
        if (Math.random() < 0.15) {  
          throw new Error('Payment gateway timeout');  
        }  

        span.setAttributes({ paymentStatus: 'SUCCESS' });  

        log.info('Payment successful', {  
          amount: req.body?.amount,  
        });  

        span.end();  
        res.json({ status: 'PAID' });  
      } catch (err) {  
        span.recordException(err);  
        span.setStatus({ code: SpanStatusCode.ERROR });  

        log.error('Payment failed', {  
          error: err.message,  
          amount: req.body?.amount,  
        });  

        span.end();  
        res.status(502).json({ error: err.message });  
      }  
    });  
  });  

  /**  
   * --------------------------------  
   * TEST FILES  
   * --------------------------------  
   */  
  app.use('/test/', express.static(TEST_DIR));  

  /**  
   * --------------------------------  
   * LOAD DATA & START SERVER  
   * --------------------------------  
   */  
  fs.readFile(DATA_FILE, (_, data) => {  
    JSON.parse(data || '[]').forEach((r) =>  
      storage.add(new RestaurantRecord(r))  
    );  

    app.listen(PORT, '0.0.0.0', () => {  
      log.info('Server started', {  
        port: PORT,  
        host: '0.0.0.0',  
      });  
      open(`http://localhost:${PORT}`);  
    });  
  });  
};  