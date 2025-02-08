import { TRAIT_CATEGORIES } from '../config/traits';
import { COLOR_MAP } from '../config/colors';

// Helper function to get a random item from an array
const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

class CharacterCreator {
  constructor() {
    this.selectedTraits = this.generateRandomTraits();
  }

  // Apply trait selection rules in the exact order specified
  applyTraitRules(traits, isRandomGeneration = false) {
    // Rule 1: Conflict Between Two Hat Categories
    if (isRandomGeneration && traits.hat_over_headphones && traits.hat_under_headphones) {
      const hatOver = traits.hat_over_headphones;
      const hatUnder = traits.hat_under_headphones;
      const isHoodieOver = hatOver.includes('hoodie');
      const isBandanaOrBeanieUnder = hatUnder.includes('bandana') || hatUnder.includes('beanie');
      
      if (!isHoodieOver || !isBandanaOrBeanieUnder) {
        Math.random() > 0.5 ? delete traits.hat_over_headphones : delete traits.hat_under_headphones;
      }
    }

    // Rule 2: Incompatibility of Hair Lengths
    if (isRandomGeneration && traits.short_hair && traits.long_hair) {
      Math.random() > 0.5 ? delete traits.short_hair : delete traits.long_hair;
    }

    // Rule 3: Shirt/Hoodie Versus Chain Conflict
    const hasHoodieUp = traits.hat_over_headphones?.includes('hoodie');
    const hasShirt = traits.shirt;
    const hasChain = traits.chain;

    if (isRandomGeneration && (hasShirt || hasHoodieUp) && hasChain) {
      if (Math.random() > 0.5) {
        delete traits.chain;
      } else {
        if (hasHoodieUp) delete traits.hat_over_headphones;
        if (hasShirt) delete traits.shirt;
      }
    }

    // Rule 4: Conflict Between Shirt and Hoodie
    if (isRandomGeneration && hasShirt && hasHoodieUp) {
      Math.random() > 0.5 ? delete traits.hat_over_headphones : delete traits.shirt;
    }

    // Rule 5a & 5b: Headwear Conflicts with Hair
    const mohawkVariants = [
      'mohawk_blue', 'mohawk_pink', 'mohawk_green', 'mohawk_black',
      'mohawk_yellow', 'mohawk_purple', 'mohawk_red'
    ];

    const messyVariants = [
      'messy_red', 'messy_yellow', 'messy_purple', 'messy_black',
      'messy_black_ape', 'messy_yellow_ape', 'messy_red_ape', 'messy_purple_ape'
    ];

    const hasMohawk = traits.short_hair && mohawkVariants.some(variant => traits.short_hair === variant);
    const hasMessy = traits.short_hair && messyVariants.some(variant => traits.short_hair === variant);

    // Any headwear (except hoodies) conflicts with mohawks and messy hair
    if (isRandomGeneration && (traits.hat_over_headphones || traits.hat_under_headphones)) {
      const headwearId = traits.hat_over_headphones || traits.hat_under_headphones;
      const isHoodie = headwearId.includes('hoodie');
      
      if (!isHoodie && (hasMohawk || hasMessy)) {
        // If it's not a hoodie and we have mohawk/messy hair, remove one randomly
        if (Math.random() > 0.5) {
          delete traits.short_hair;
        } else {
          delete traits.hat_over_headphones;
          delete traits.hat_under_headphones;
        }
      }
    }

    // Top headwear conflicts with ALL hair
    const topHeadwear = ['top', 'pilot', 'cowboy'];
    const hasTopHeadwear = traits.hat_over_headphones && topHeadwear.some(hw => traits.hat_over_headphones === hw);
    
    if (isRandomGeneration && hasTopHeadwear) {
      delete traits.short_hair;
      delete traits.long_hair;
    }

    // Rule 7: Hoodie Versus Long Hair Conflict
    if (isRandomGeneration && hasHoodieUp) {
      delete traits.long_hair;
      delete traits.short_hair;
    }

    // Rules 8-13: Type-specific eye rules - ALWAYS apply these regardless of random generation
    // Rule 8: Zombie Type – Adjusting Eye Trait
    if (traits.type === 'zombie') {
      // If zombie type and regular/red eyes, force zombie eyes
      if (['regular', 'red'].includes(traits.eyes)) {
        traits.eyes = 'zombie';
      }
    } else if (traits.eyes === 'zombie') {
      // If not zombie type but has zombie eyes, convert to regular
      traits.eyes = 'regular';
    }

    // Rule 9: Non-Zombie Type – Correcting Erroneous Zombie Eyes
    if (traits.type !== 'zombie' && traits.eyes === 'zombie') {
      traits.eyes = 'regular';
    }

    // Rule 10: Alien Type – Adjusting Eye Trait
    if (traits.type === 'alien' && traits.eyes === 'regular') {
      traits.eyes = 'alien';
    }

    // Rule 11: Ape Type – Converting Messy Hair
    if (traits.type === 'ape') {
      // Convert messy hair to ape versions
      if (traits.short_hair && traits.short_hair.startsWith('messy_') && !traits.short_hair.includes('_ape')) {
        const color = traits.short_hair.replace('messy_', '');
        traits.short_hair = `messy_${color}_ape`;
      }
    } else {
      // Convert ape messy hair back to regular versions when not ape type
      if (traits.short_hair && traits.short_hair.includes('_ape')) {
        const color = traits.short_hair.replace('messy_', '').replace('_ape', '');
        traits.short_hair = `messy_${color}`;
      }
    }

    // Rule 12: Based $mfer Type – Adjusting Eye Trait
    if (traits.type === 'based' && ['alien', 'zombie', 'red'].includes(traits.eyes)) {
      traits.eyes = 'mfercoin';
    }

    // Rule 13: Metal Mfer Type – Adjusting Eye Trait
    if (traits.type === 'metal' && ['alien', 'zombie', 'red'].includes(traits.eyes)) {
      traits.eyes = 'metal';
    }

    // Rule 14: Long Hair (Curly) Incompatible with Square Headphones
    const squareHeadphones = ['black_square', 'blue_square', 'gold_square'];
    if (isRandomGeneration && traits.long_hair === 'long_curly' && squareHeadphones.includes(traits.headphones)) {
      delete traits.long_hair;
    }

    // Rule 15: Pilot Helmet Incompatible with Square Headphones
    if (isRandomGeneration && traits.hat_over_headphones === 'pilot' && squareHeadphones.includes(traits.headphones)) {
      delete traits.hat_over_headphones;
    }

    // Final Cleanup: Remove any empty traits
    Object.keys(traits).forEach(key => {
      if (!traits[key]) delete traits[key];
    });

    return traits;
  }

  // Generate random traits, ensuring required traits are included
  generateRandomTraits() {
    // Start with mandatory traits
    const traits = {
      background: getRandomItem(TRAIT_CATEGORIES.background.options).id,
      type: getRandomItem(TRAIT_CATEGORIES.type.options).id,
      // Filter out special eye types for random selection
      eyes: getRandomItem(TRAIT_CATEGORIES.eyes.options.filter(eye => 
        !['metal', 'mfercoin', 'zombie', 'alien'].includes(eye.id)
      )).id,
      mouth: getRandomItem(TRAIT_CATEGORIES.mouth.options).id,
      headphones: getRandomItem(TRAIT_CATEGORIES.headphones.options).id
    };

    // Add optional traits with 50% chance each
    const optionalCategories = Object.entries(TRAIT_CATEGORIES)
      .filter(([key]) => !['background', 'type', 'eyes', 'mouth', 'headphones'].includes(key));

    optionalCategories.forEach(([category, data]) => {
      if (Math.random() > 0.5) {
        traits[category] = getRandomItem(data.options).id;
      }
    });

    // Apply rules to ensure valid combinations, with isRandomGeneration = true
    return this.applyTraitRules(traits, true);
  }

  // Get theme color based on selected background
  getThemeColor(selectedTraits) {
    const background = TRAIT_CATEGORIES.background.options.find(opt => opt.id === selectedTraits.background);
    return background ? `#${COLOR_MAP[background.id] || '4CAF50'}` : '#4CAF50'; // Default to green if no background selected
  }

  // Handle trait change
  handleTraitChange(traitType, value) {
    const newTraits = {
      ...this.selectedTraits,
      [traitType]: value
    };
    // Apply rules with isRandomGeneration = false for manual changes
    this.selectedTraits = this.applyTraitRules(newTraits, false);
    return this.selectedTraits;
  }

  // Clear all traits and set defaults
  clearAll() {
    this.selectedTraits = {
      ...Object.keys(this.selectedTraits).reduce((acc, key) => ({ ...acc, [key]: '' }), {}),
      type: 'plain',
      eyes: 'regular',
      mouth: 'smile',
      background: 'orange',
      headphones: 'black',
      smoke: 'cig_black',
      watch: 'argo_white'
    };
    return this.selectedTraits;
  }

  // Generate new random traits
  randomize() {
    this.selectedTraits = this.generateRandomTraits();
    return this.selectedTraits;
  }

  // Get current selected traits
  getSelectedTraits() {
    return this.selectedTraits;
  }
}

export default CharacterCreator; 