export const TRAIT_CATEGORIES = {
  type: {
    name: 'Type',
    options: [
      { id: 'plain', label: 'Plain mfer', model: 'plain mfer.glb' },
      { id: 'zombie', label: 'Zombie mfer', model: 'zombie mfer.glb' },
      { id: 'metal', label: 'Metal mfer', model: 'metal mfer.glb' },
      { id: 'larva', label: 'Larva mfer', model: 'larva mfer.glb' }
    ]
  },
  eyes: {
    name: 'Eyes',
    options: [
      { id: 'regular', label: 'Normal', model: 'regular eyes.glb' },
      { id: 'zombie', label: 'Zombie eyes', model: 'zombie eyes.glb' },
      { id: 'vr', label: 'VR', model: 'vr.glb' },
      { id: 'shades', label: 'Shades', model: 'shades.glb' },
      { id: 'purple_shades', label: 'Purple shades', model: 'purple shades.glb' },
      { id: 'nerd', label: 'Nerd glasses', model: 'nerd glasses.glb' },
      { id: 'trippy', label: 'Trippy shades', model: 'trippy shades.glb' },
      { id: 'matrix', label: 'Matrix shades', model: 'matrix shades.glb' },
      { id: 'red', label: 'Red eyes', model: 'red eyes.glb' }
    ]
  },
  mouth: {
    name: 'Mouth',
    options: [
      { id: 'flat', label: 'Flat', model: 'flat.glb' },
      { id: 'smile', label: 'Smile', model: 'smile.glb' }
    ]
  },
  headphones: {
    name: 'Headphones',
    options: [
      { id: 'white', label: 'White headphones', model: 'white headphones.glb' },
      { id: 'red', label: 'Red headphones', model: 'red headphones.glb' },
      { id: 'green', label: 'Green headphones', model: 'green headphones.glb' },
      { id: 'pink', label: 'Pink headphones', model: 'pink headphones.glb' },
      { id: 'gold', label: 'Gold headphones', model: 'gold headphones.glb' },
      { id: 'gold_square', label: 'Gold square headphones', model: 'gold square headphones.glb' },
      { id: 'lined', label: 'Lined headphones', model: 'lined headphones.glb' }
    ]
  },
  hat: {
    name: 'Hat',
    options: [
      { id: 'pilot', label: 'Pilot helmet', model: 'pilot helmet.glb' },
      { id: 'top', label: 'Top hat', model: 'top hat.glb' },
      // Knit hats
      { id: 'knit_sf', label: 'SF Knit', model: 'knit san fran.glb' },
      { id: 'knit_ny', label: 'NY Knit', model: 'knit new york.glb' },
      { id: 'knit_pit', label: 'Pittsburgh Knit', model: 'knit pittsburgh.glb' },
      { id: 'knit_lv', label: 'Las Vegas Knit', model: 'knit las vegas.glb' },
      { id: 'knit_miami', label: 'Miami Knit', model: 'knit miami.glb' }
    ]
  },
  hair: {
    name: 'Hair',
    options: [
      // Mohawk
      { id: 'mohawk_yellow', label: 'Yellow Mohawk', model: 'mohawk yellow.glb' },
      { id: 'mohawk_red', label: 'Red Mohawk', model: 'mohawk red.glb' },
      { id: 'mohawk_purple', label: 'Purple Mohawk', model: 'mohawk purple.glb' },
      { id: 'mohawk_black', label: 'Black Mohawk', model: 'mohawk black.glb' },
      { id: 'mohawk_green', label: 'Green Mohawk', model: 'mohawk green.glb' },
      { id: 'mohawk_blue', label: 'Blue Mohawk', model: 'mohawk blue.glb' },
      { id: 'mohawk_pink', label: 'Pink Mohawk', model: 'mohawk pink.glb' },
      // Messy
      { id: 'messy_red', label: 'Messy Red', model: 'messy red.glb' },
      { id: 'messy_black', label: 'Messy Black', model: 'messy black.glb' },
      { id: 'messy_purple', label: 'Messy Purple', model: 'messy purple.glb' },
      // Long
      { id: 'long_black', label: 'Long Black', model: 'long hair black.glb' },
      { id: 'long_yellow', label: 'Long Yellow', model: 'long hair yellow.glb' },
      { id: 'long_curly', label: 'Long Curly', model: 'long hair curly.glb' }
    ]
  },
  clothing: {
    name: 'Clothing',
    options: [
      // Hoodies
      { id: 'hoodie_pink', label: 'Pink Hoodie', model: 'hoodie pink.glb' },
      { id: 'hoodie_red', label: 'Red Hoodie', model: 'hoodie red.glb' },
      { id: 'hoodie_green', label: 'Green Hoodie', model: 'hoodie green.glb' },
      { id: 'hoodie_white', label: 'White Hoodie', model: 'hoodie white.glb' },
      { id: 'hoodie_gray', label: 'Gray Hoodie', model: 'hoodie gray.glb' },
      { id: 'hoodie_blue', label: 'Blue Hoodie', model: 'hoodie blue.glb' },
      // Hoodies Down
      { id: 'hoodie_down_gray', label: 'Gray Hoodie Down', model: 'hoodie down gray.glb' },
      { id: 'hoodie_down_red', label: 'Red Hoodie Down', model: 'hoodie down red.glb' },
      { id: 'hoodie_down_blue', label: 'Blue Hoodie Down', model: 'hoodie down blue.glb' },
      { id: 'hoodie_down_pink', label: 'Pink Hoodie Down', model: 'hoodie down pink.glb' },
      { id: 'hoodie_down_white', label: 'White Hoodie Down', model: 'hoodie down white.glb' },
      { id: 'hoodie_down_green', label: 'Green Hoodie Down', model: 'hoodie down green.glb' }
    ]
  },
  accessories: {
    name: 'Accessories',
    options: [
      // Chains
      { id: 'gold_chain', label: 'Gold Chain', model: 'gold chain.glb' },
      { id: 'silver_chain', label: 'Silver Chain', model: 'silver chain.glb' },
      // Watches
      { id: 'oyster_gold', label: 'Gold Oyster', model: 'oyster gold.glb' },
      { id: 'oyster_silver', label: 'Silver Oyster', model: 'oyster silver.glb' },
      { id: 'sub_black', label: 'Black Sub', model: 'sub black.glb' },
      { id: 'sub_blue', label: 'Blue Sub', model: 'sub blue.glb' },
      { id: 'sub_red', label: 'Red Sub', model: 'sub red.glb' },
      { id: 'sub_rose', label: 'Rose Sub', model: 'sub rose.glb' },
      { id: 'sub_turquoise', label: 'Turquoise Sub', model: 'sub turquoise.glb' },
      // Smoking
      { id: 'pipe', label: 'Pipe', model: 'pipe.glb' },
      { id: 'pipe_brown', label: 'Brown Pipe', model: 'pipe brown.glb' }
    ]
  },
  beard: {
    name: 'Beard',
    options: [
      { id: 'full_beard', label: 'Full Beard', model: 'full beard.glb' },
      { id: 'flat_beard', label: 'Flat Beard', model: 'flat beard.glb' }
    ]
  }
}; 