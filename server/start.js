'use strict';

/**
 * IMPORTANT:
 * OpenTelemetry MUST be initialized
 * BEFORE index.js / express / http are loaded
 */
require('./otel');

var PORT = (process.argv[2] && parseInt(process.argv[2], 10)) || 3000;
var STATIC_DIR = __dirname + '/../app';
var TEST_DIR = __dirname + '/../test';
var DATA_FILE = __dirname + '/data/restaurants.json';

const menuStore = require('./menuStore');
menuStore.loadMenus(__dirname + '/data/menus.csv');

require('./index').start(PORT, STATIC_DIR, DATA_FILE, TEST_DIR);
