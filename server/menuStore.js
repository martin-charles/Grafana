'use strict';

const fs = require('fs');
const { parse } = require('csv-parse/sync');

let menus = [];

function loadMenus(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  menus = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`Loaded ${menus.length} menu items`);
}

function getMenuForRestaurant(restaurant) {
  const cuisine =
    restaurant.cuisine ||
    restaurant.Cuisine ||
    restaurant.type ||
    restaurant.category;

  if (!cuisine) return [];

  return menus
    .filter(
      (m) => m.Cuisine.toLowerCase() === cuisine.toLowerCase()
    )
    .map((m) => ({
      name: m['Item Name'],
      price: Number(m.Price),
    }));
}

module.exports = {
  loadMenus,
  getMenuForRestaurant,
};
