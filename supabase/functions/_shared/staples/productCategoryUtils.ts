// PORTED VERBATIM FROM src/lib/productCategoryUtils.ts — DO NOT EDIT DIRECTLY.
//
// Supabase edge functions run on Deno and cannot import from src/, so the
// weekly staples email keeps a byte-identical copy of the app's selection
// logic: `isProductRelevantForSearch` and its category rules — the final relevance
// guard the /deals staple grid applies to every RPC candidate.
//
// To change behavior, edit src/lib/productCategoryUtils.ts and re-copy the file below. The
// parity suite in this directory fails if the two ever drift.
//
// ---- BEGIN PORTED SOURCE ----
// =============================================================================
// Product Category Utilities — shared by Deals.tsx and CartFinder.tsx
// =============================================================================

// --- Text normalization and matching utilities ---

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularizeToken(word: string): string {

  // Too small a word for fuzzy and singularizing
  if (word.length <= 3) {
    return word
  }

  // Strawberries -> strawberry
  if (word.endsWith("ies")) {
    return word.slice(0, -3) + "y"
  }

  // Boxes -> box
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes") || word.endsWith("ches") || word.endsWith("shes")) {
    return word.slice(0, -2)
  }

  // Potatoes -> potato
  if (word.endsWith("oes")) {
    return word.slice(0, -2)
  }

  // Asparagus and glass are valid
  if (word.endsWith("ss") || word.endsWith("us")) {
    return word
  }

  // Bananas -> banana
  if (word.endsWith("s")) {
    return word.slice(0, -1)
  }

  return word
}

export function canonicalize(text: string): string {
  const norm = normalizeText(text)
  return norm.split(" ").map(singularizeToken).join(" ")
}

export function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

export function hasToken(tokens: string[], token: string): boolean {
  return tokens.includes(token);
}

export function hasAnyToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((c) => tokens.includes(c));
}

export function hasPhrase(normalizedText: string, phrase: string): boolean {
  const np = normalizeText(phrase);
  const escaped = np.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(normalizedText);
}

export function hasAnyPhrase(normalizedText: string, phrases: string[]): boolean {
  return phrases.some((p) => hasPhrase(normalizedText, p));
}

// --- Signal constants for heuristic functions ---

export const BEVERAGE_SIGNAL_TOKENS = [
  "soda", "cola", "juice", "coffee", "tea", "kombucha", "seltzer",
  "sparkling", "lemonade", "gatorade", "pepsi", "coke", "sprite",
  "fanta", "drpepper", "mountain", "dew",
];
export const BEVERAGE_BRAND_TOKENS = [
  "pepsi", "coke", "coca", "sprite", "fanta", "drpepper", "gatorade",
  "powerade", "snapple", "lipton", "arizona", "brisk", "starbucks",
  "dunkin", "nescafe", "folgers", "maxwell", "dasani", "aquafina",
  "evian", "fiji", "voss", "lacroix", "perrier", "pellegrino",
  "poland", "ozarka", "arrowhead", "crystal",
  "7up", "sunkist", "crush", "fresca",
];
export const DRINKWARE_TOKENS = [
  "tumbler", "mug", "thermos", "canteen", "carafe", "flask",
  "pitcher", "decanter", "goblet", "stein",
];
export const DRINKWARE_BRAND_TOKENS = [
  "yeti", "hydroflask", "hydro", "nalgene", "contigo", "camelbak",
  "stanley", "embark", "takeya", "tervis", "klean", "swell", "rtic",
];
export const DRINKWARE_PHRASES = [
  "stainless steel bottle", "insulated bottle", "water jug",
  "travel mug", "reusable bottle",
];

// --- Heuristic detection functions ---

export function looksLikeBeverage(tokens: string[], norm: string): boolean {
  if (hasAnyToken(tokens, BEVERAGE_SIGNAL_TOKENS)) return true;
  if (hasAnyToken(tokens, BEVERAGE_BRAND_TOKENS)) return true;
  if (hasAnyPhrase(norm, [
    "bottled water", "sparkling water", "spring water", "drinking water",
    "mineral water", "coconut water", "purified water", "distilled water",
    "alkaline water", "energy drink", "sports drink",
  ])) return true;
  return false;
}

export function looksLikeDrinkware(tokens: string[], norm: string): boolean {
  if (hasAnyToken(tokens, DRINKWARE_TOKENS)) return true;
  if (hasAnyToken(tokens, DRINKWARE_BRAND_TOKENS)) return true;
  if (hasAnyPhrase(norm, DRINKWARE_PHRASES)) return true;
  // "bottle" or "bottles" without beverage context → drinkware
  if (hasAnyToken(tokens, ["bottle", "bottles"]) && !looksLikeBeverage(tokens, norm)) {
    return true;
  }
  return false;
}

export const PRODUCE_INCLUDE_TOKENS = [
  "apples", "apple", "bananas", "banana", "oranges", "orange",
  "tomatoes", "tomato", "lettuce", "spinach", "kale", "broccoli",
  "carrots", "carrot", "celery", "onions", "onion", "potatoes",
  "potato", "peppers", "pepper", "cucumber", "avocado", "avocados",
  "grapes", "berries", "strawberries", "blueberries", "raspberries",
  "lemons", "lemon", "limes", "lime", "mango", "mangoes",
  "pineapple", "watermelon", "peaches", "peach", "pears", "pear",
  "mushrooms", "mushroom", "zucchini", "squash", "corn",
  "asparagus", "cabbage", "cauliflower", "garlic", "cilantro",
  "parsley", "basil", "oregano", "ginger", "beets", "radish", "radishes",
  "artichoke", "artichokes", "fennel", "turnip", "turnips",
  "plums", "plum", "nectarines", "nectarine", "cherries", "cherry",
  "pomegranate", "papaya", "guava", "kiwi", "tangerine", "tangerines",
  "clementine", "clementines", "mandarin", "mandarins",
];

export const SODA_BRAND_TOKENS = [
  "sprite", "7up", "sierra", "mist", "squirt", "sunkist",
  "fanta", "crush", "fresca", "minute", "maid", "tropicana",
  "simply", "dole", "sobe",
];

export const AMBIGUOUS_PRODUCE_TOKENS = [
  "pepper", "peppers", "garlic", "ginger", "cilantro", "parsley",
  "basil", "oregano", "mint", "lime", "limes", "lemon", "lemons",
  "orange", "oranges", "corn", "squash",
];

export function looksLikeProduce(tokens: string[], norm: string): boolean {
  const produceContext = [
    "fresh", "organic", "bunch", "bag", "lb", "lbs", "each",
    "head", "stalk", "stalks", "ea", "ct",
  ];
  if (hasAnyToken(tokens, produceContext)) return true;
  if (hasAnyPhrase(norm, ["fresh fruit", "fresh vegetables"])) return true;
  return false;
}

// --- Context detectors ---

export const SNACK_TOKENS = [
  "chips", "crisps", "nachos", "nacho", "pretzels", "popcorn",
  "snack", "snacks", "snacking", "cracker", "crackers",
  "bites", "jerky", "rounds",
];
export const SNACK_BRAND_TOKENS = [
  "doritos", "ruffles", "lays", "takis", "cheetos", "pringles",
  "fritos", "tostitos", "goldfish", "sunchips", "cheezit", "cheez",
  "hillshire",
];
export function looksLikeSnack(tokens: string[], norm: string): boolean {
  if (hasAnyToken(tokens, SNACK_TOKENS)) return true;
  if (hasAnyToken(tokens, SNACK_BRAND_TOKENS)) return true;
  if (hasAnyPhrase(norm, [
    "potato chips", "tortilla chips", "corn chips",
    "snack pack", "variety pack", "meat snack",
    "granola bar", "protein bar", "trail mix",
    "toasted rounds",
  ])) return true;
  return false;
}

export function looksLikePastaSauce(tokens: string[], norm: string): boolean {
  if (hasAnyPhrase(norm, [
    "pasta sauce", "spaghetti sauce", "marinara sauce", "alfredo sauce",
    "tomato sauce", "pesto sauce",
  ])) return true;
  if (hasToken(tokens, "sauce") &&
      hasAnyToken(tokens, ["pasta", "spaghetti", "marinara", "alfredo"])) return true;
  return false;
}

export function looksLikePantryInstant(tokens: string[], norm: string): boolean {
  const pantryContext = [
    "rice", "grains", "grain", "instant", "mix", "packet",
    "ichiban", "sapporo", "maruchan", "nissin",
  ];
  if (hasAnyToken(tokens, pantryContext)) return true;
  if (hasAnyPhrase(norm, [
    "rice and sauce", "rice sauce", "noodle soup",
    "instant noodle", "cup noodle",
  ])) return true;
  return false;
}

export const POSITIVE_MEAT_SIGNALS = [
  "breast", "thigh", "thighs", "drumstick", "drumsticks",
  "wing", "wings", "fillet", "filet", "steak", "chops", "chop",
  "ribs", "roast", "tenderloin", "sirloin", "ribeye",
  "brisket", "loin", "cutlet", "cutlets", "boneless", "skinless",
  "raw", "lb", "lbs",
];

export const HERB_TOKENS = [
  "basil", "oregano", "cilantro", "parsley", "mint", "dill",
  "rosemary", "thyme", "sage", "chives",
];

export const SAUCE_CONDIMENT_TOKENS = [
  "sauce", "dipping", "dip", "marinade", "glaze", "dressing",
  "condiment", "bbq", "teriyaki", "soy", "ketchup", "mustard",
  "mayo", "aioli", "salsa", "vinaigrette",
];

export function looksLikeSauceOrCondiment(tokens: string[], norm: string): boolean {
  if (hasAnyToken(tokens, SAUCE_CONDIMENT_TOKENS)) return true;
  if (hasAnyPhrase(norm, [
    "dipping sauce", "wing sauce", "hot sauce", "steak sauce",
    "bbq sauce", "barbecue sauce", "teriyaki sauce",
    "soy sauce", "buffalo sauce",
  ])) return true;
  return false;
}

// --- Shelf-stable seafood detection ---

export const SEAFOOD_TOKENS = [
  "tuna", "salmon", "sardines", "sardine", "anchovies", "anchovy",
  "mackerel", "kipper", "herring", "trout", "crab", "shrimp",
];

export const ALWAYS_SHELF_STABLE_FISH = [
  "sardines", "sardine", "anchovies", "anchovy",
  "mackerel", "kipper", "herring",
];

export const SHELF_STABLE_TOKENS = [
  "canned", "can", "pouch", "packet", "sachet", "tin", "jar",
  "packed", "chunk", "albacore", "smoked", "seasoned",
];
export const SHELF_STABLE_PHRASES = [
  "chunk light", "solid white", "in water", "in spring water",
  "in oil", "packed in", "ready to eat", "on the go",
  "pouch pack", "pink salmon",
];
export const SHELF_STABLE_BRANDS = [
  "chicken of the sea", "starkist", "bumble bee", "northern catch",
];

export const FRESH_FISH_SIGNALS = [
  "fillet", "filet", "steak", "fresh", "raw", "loin",
  "sashimi", "whole", "cut", "previously frozen", "farm raised",
  "counter",
];

export const COMMONLY_CANNED_SPECIES = ["tuna", "salmon"];

export function looksLikeShelfStableSeafood(
  tokens: string[],
  norm: string,
  size: string | null
): boolean {
  if (hasAnyToken(tokens, ALWAYS_SHELF_STABLE_FISH)) return true;
  if (hasAnyPhrase(norm, SHELF_STABLE_BRANDS)) return true;

  const hasFishToken = hasAnyToken(tokens, SEAFOOD_TOKENS);
  if (!hasFishToken) return false;

  if (hasAnyToken(tokens, FRESH_FISH_SIGNALS)) return false;
  if (hasAnyPhrase(norm, ["previously frozen", "farm raised", "skin on"])) return false;

  if (
    hasAnyToken(tokens, SHELF_STABLE_TOKENS) ||
    hasAnyPhrase(norm, SHELF_STABLE_PHRASES)
  ) {
    return true;
  }

  const parseOz = (s: string): number | null => {
    const m = s.match(/(\d+(?:\.\d+)?)\s*oz/i);
    return m ? parseFloat(m[1]) : null;
  };
  const oz = (size ? parseOz(size) : null) ?? parseOz(norm);

  if (oz && oz > 0) {
    if (oz <= 6) return true;
    if (oz <= 18 && hasAnyToken(tokens, COMMONLY_CANNED_SPECIES)) return true;
  }

  return false;
}

// --- Pet food and baby food detection ---

export function looksLikePetFood(tokens: string[], norm: string): boolean {
  const petTokens = [
    "dog", "cat", "pet", "puppy", "kitten", "feline", "canine",
    "kibble", "pup", "kitty",
  ];
  const petBrands = [
    "purina", "iams", "friskies", "pedigree", "beneful",
    "meow", "kibbles", "wellness", "rachael",
  ];
  const petPhrases = [
    "dog food", "cat food", "dog entree", "cat entree", "pet food",
    "dog treat", "cat treat", "heart to tail", "blue buffalo",
    "for dogs", "for cats", "for puppies", "for kittens",
  ];
  if (hasAnyToken(tokens, petTokens)) return true;
  if (hasAnyToken(tokens, petBrands)) return true;
  if (hasAnyPhrase(norm, petPhrases)) return true;
  return false;
}

export function looksLikeBabyFood(tokens: string[], norm: string): boolean {
  const babyTokens = ["baby", "infant", "toddler", "gerber", "beechnut"];
  const babyPhrases = [
    "baby food", "2nd foods", "3rd foods", "stage 1", "stage 2", "stage 3",
    "1st foods", "nutritious dinner", "for babies",
  ];
  if (hasAnyToken(tokens, babyTokens)) return true;
  if (hasAnyPhrase(norm, babyPhrases)) return true;
  return false;
}

// --- Category rule definitions ---

export type CategoryRule = {
  includeAnyTokens?: string[];
  includeAnyPhrases?: string[];
  excludeAnyTokens?: string[];
  excludeAnyPhrases?: string[];
  requireAllTokens?: string[];
  customGuard?: (name: string, tokens: string[], size: string | null) => boolean;
};

export const CATEGORY_RULES: Record<string, CategoryRule> = {
  dairy: {
    includeAnyTokens: [
      "milk", "cheese", "yogurt", "butter", "cream", "kefir",
      "ricotta", "mozzarella", "cheddar", "parmesan", "provolone",
      "gouda", "brie", "colby", "monterey",
    ],
    includeAnyPhrases: [
      "sour cream", "cottage cheese", "cream cheese",
      "half and half", "whipped cream", "heavy cream",
      "salted butter", "unsalted butter", "butter sticks",
    ],
    excludeAnyTokens: [
      "bread", "loaf", "buns", "bagel", "ramen", "noodle", "noodles",
      "stuffing", "stock", "broth", "soup", "cocoa", "cookie", "cookies",
      "cracker", "crackers", "popcorn", "cake", "muffin", "muffins",
      "brownie", "brownies", "pie", "pastry", "croissant",
      ...SNACK_TOKENS, ...SNACK_BRAND_TOKENS,
      "potato", "potatoes", "russet",
      "chocolate", "macaroni", "candy", "coated", "covered", "duds", "fudge",
      "condensed",
      "frozen", "pizza", "knorr",
      "burrito", "taco", "quesadilla", "enchilada",
      "shells", "dinner", "helper", "velveeta", "annie",
      "stouffer", "digiorno", "totino", "banquet", "marie", "microwavable",
    ],
    excludeAnyPhrases: [
      "peanut butter", "almond butter", "sunflower butter", "cashew butter",
      "body butter", "shea butter", "cocoa butter",
      "ice cream",
      "butter cake", "butter cookies", "butter pastry",
      "butter pecan", "butter toffee",
      "pasta sauce", "spaghetti sauce", "marinara sauce",
      "alfredo sauce", "tomato sauce", "cheese sauce",
      "potato chips", "tortilla chips",
      "mac and cheese", "mac cheese",
      "toasted rounds", "meat snack",
      "almond milk", "oat milk", "soy milk", "coconut milk",
      "cashew milk", "rice milk", "hemp milk", "flax milk",
      "milk chocolate", "white chocolate", "yogurt covered", "yogurt coating",
      "yogurt raisin", "yogurt craisin", "macaroni and cheese", "macaroni cheese",
      "macaroni & cheese",
      "cream style corn", "creamed corn", "cream corn",
      "cream of mushroom", "cream of chicken", "cream of celery",
      "condensed soup", "cream of",
      "cheese pizza", "pasta sides", "rice sides",
      "shells and cheese", "shells & cheese",
      "hot pocket", "hot pockets", "lean pocket", "bagel bites",
    ],
    customGuard: (name: string, tokens: string[]): boolean => {
      const norm = normalizeText(name);

      if (looksLikePetFood(tokens, norm)) return false;
      if (looksLikeBabyFood(tokens, norm)) return false;

      if (hasToken(tokens, "butter")) {
        const bakedGoods = [
          "bread", "loaf", "roll", "rolls", "bun", "buns", "biscuit",
          "biscuits", "scone", "scones", "brioche", "danish", "pretzel",
          "pretzels", "pancake", "pancakes", "waffle", "waffles",
        ];
        if (hasAnyToken(tokens, bakedGoods)) return false;
        if (!hasPhrase(norm, "butter")) return false;
        if (hasAnyToken(tokens, PRODUCE_INCLUDE_TOKENS)) return false;
        if (looksLikeSnack(tokens, norm)) return false;
      }

      if (hasToken(tokens, "cheese") || hasToken(tokens, "cheddar") ||
          hasToken(tokens, "parmesan") || hasToken(tokens, "mozzarella")) {
        const dairyMeatTokens = [
          "chicken", "beef", "pork", "turkey", "ham", "sausage", "pepperoni",
        ];
        if (hasAnyToken(tokens, dairyMeatTokens)) return false;
        const preparedEntreeTokens = ["stuffed", "breast", "cutlet", "entree", "deli"];
        if (hasAnyToken(tokens, preparedEntreeTokens) && hasToken(tokens, "chicken")) return false;

        const mealFrozenPreparedTokens = [
          "frozen", "pizza", "burrito", "taco", "enchilada", "quesadilla",
          "sticks", "bites", "nuggets", "poppers", "pocket", "bagel",
          "dinner", "sides", "knorr", "stouffer", "digiorno", "totino",
          "lean", "banquet", "marie", "microwavable",
          "appetizer", "appetizers",
        ];
        if (hasAnyToken(tokens, mealFrozenPreparedTokens)) return false;
      }
      if (hasToken(tokens, "cheese") || hasToken(tokens, "cheddar")) {
        if (looksLikeSnack(tokens, norm)) return false;
        if (looksLikePastaSauce(tokens, norm)) return false;
        if (looksLikeSauceOrCondiment(tokens, norm)) return false;
      }

      if (hasToken(tokens, "cream")) {
        if (looksLikeSnack(tokens, norm)) return false;
        if (hasAnyToken(tokens, PRODUCE_INCLUDE_TOKENS)) return false;
        if (hasPhrase(norm, "cream of")) return false;
      }

      return true;
    },
  },

  produce: {
    includeAnyTokens: PRODUCE_INCLUDE_TOKENS,
    includeAnyPhrases: [
      "fresh fruit", "fresh vegetables", "salad mix",
      "baby spinach", "romaine hearts",
    ],
    excludeAnyTokens: [
      "sauce", "soup", "juice", "jam", "canned", "chips", "frozen",
      "dried", "powder", "seasoning", "soda", "cola", "seltzer",
      "kombucha", "cocktail", "margarita", "shandy",
      "rotisserie", "deli", "cooked", "entree", "chicken",
      "syrup", "kernel",
      "yogurt", "condensed", "ketchup",
      "pie", "pies", "cake", "cakes", "cobbler", "pudding", "cheesecake",
      "stewed", "diced", "sliced", "crushed", "petite", "rotel",
      "steamable", "steamfresh", "steam",
      "can", "jar", "preserved", "pickled", "dehydrated",
      "guacamole", "hummus", "salsa",
      "pasta", "noodle", "noodles", "fusilli", "penne", "rigatoni", "linguine", "fettuccine", "macaroni",
      "sides", "helper", "velveeta", "annie", "knorr",
      "cheddar", "parmesan", "mozzarella",
      "pouch", "packet", "sachet", "mix",
      "seasoned", "flavored", "flavors",
      "casserole", "skillet", "stouffer", "banquet", "microwavable",
      "ranch", "dressing",
      "rind", "rinds",
    ],
    excludeAnyPhrases: [
      "tomato sauce", "tomato paste", "apple juice", "orange juice",
      "lemon juice", "lime juice", "potato chips", "corn chips",
      "lemon drop", "lime soda", "orange soda", "lemon soda",
      "rotisserie chicken", "meal kit", "ready to eat",
      "fully cooked", "hot and ready",
      "in syrup", "in light syrup", "in heavy syrup", "cream style",
      "whole kernel", "in tomato juice", "petite diced", "diced tomatoes",
      "cream of mushroom", "cream of chicken", "cream of celery", "cream of",
      "condensed soup", "tomato ketchup",
      "apple pie", "cherry pie", "peach pie", "blueberry pie",
      "strawberry pie", "lemon pie", "lime pie", "pumpkin pie",
      "berry pie", "fruit pie", "strawberry cake", "strawberry shortcake", "peach cobbler", "banana pudding",
      "canned tomatoes", "stewed tomatoes", "diced tomatoes",
      "crushed tomatoes", "tomato paste", "tomato puree",
      "in juice", "in brine",
      "freeze dried", "sun dried",
      "pasta sides", "rice sides", "noodle soup",
      "shells and cheese", "shells & cheese",
      "mac and cheese", "macaroni and cheese", "macaroni & cheese",
      "broccoli cheddar", "cheddar broccoli",
      "corn chips", "corn syrup",
      "pork rinds",
    ],
    customGuard: (name: string, tokens: string[], size: string | null): boolean => {
      const norm = normalizeText(name);

      if (looksLikePetFood(tokens, norm)) return false;
      if (looksLikeBabyFood(tokens, norm)) return false;
      if (looksLikeSauceOrCondiment(tokens, norm)) return false;

      if (looksLikePastaSauce(tokens, norm)) return false;
      if (hasToken(tokens, "pesto")) return false;

      const matchedHerbs = HERB_TOKENS.filter((t) => hasToken(tokens, t));
      const matchedAll = PRODUCE_INCLUDE_TOKENS.filter((t) => hasToken(tokens, t));
      if (matchedHerbs.length > 0 && matchedAll.every((t) => HERB_TOKENS.includes(t))) {
        if (!looksLikeProduce(tokens, norm)) return false;
      }

      const cannedFrozenPreservedTokens = [
        "stewed", "diced", "sliced", "crushed", "steamable", "steamfresh",
        "canned", "jar", "pickled", "preserved", "marinated", "roasted",
      ];
      if (hasAnyToken(tokens, cannedFrozenPreservedTokens)) return false;

      const pantryPreparedTokens = [
        "pasta", "noodle", "noodles", "fusilli", "penne", "rigatoni",
        "linguine", "fettuccine", "macaroni", "sides", "helper",
        "velveeta", "knorr", "stouffer", "banquet", "microwavable",
        "casserole", "skillet", "seasoned", "flavored", "mix",
        "pouch", "packet", "sachet",
        "cheddar", "parmesan", "mozzarella",
        "ranch", "dressing", "rind", "rinds",
      ];
      if (hasAnyToken(tokens, pantryPreparedTokens)) return false;

      const preparedTokens = [
        "rotisserie", "chicken", "deli", "meal", "kit", "ready",
        "cooked", "entree", "sandwich", "wrap", "bowl", "plate",
      ];
      if (hasAnyToken(tokens, preparedTokens)) return false;
      const preparedPhrases = [
        "rotisserie chicken", "meal kit", "ready to eat",
        "fully cooked", "hot and ready",
      ];
      if (hasAnyPhrase(norm, preparedPhrases)) return false;

      if (
        (hasToken(tokens, "dr") && hasToken(tokens, "pepper")) ||
        hasPhrase(norm, "dr pepper") ||
        hasToken(tokens, "drpepper")
      ) {
        return false;
      }

      const matchedProduce = PRODUCE_INCLUDE_TOKENS.filter((t) => hasToken(tokens, t));
      const onlyAmbiguous =
        matchedProduce.length > 0 &&
        matchedProduce.every((t) => AMBIGUOUS_PRODUCE_TOKENS.includes(t));

      if (onlyAmbiguous) {
        if (looksLikeBeverage(tokens, norm)) return false;
        if (hasAnyToken(tokens, SODA_BRAND_TOKENS)) return false;

        const sizeIndicatesProduce =
          size != null && /\b\d+(\.\d+)?\s*(lb|lbs|oz|ct|count)\b/i.test(size);
        const hasProduceContext =
          looksLikeProduce(tokens, norm) || sizeIndicatesProduce;

        if (!hasProduceContext) return false;
        return true;
      }

      if (looksLikeBeverage(tokens, norm) && !looksLikeProduce(tokens, norm)) {
        return false;
      }

      return true;
    },
  },

  meat: {
    includeAnyTokens: [
      "chicken", "beef", "pork", "turkey", "lamb", "salmon", "tuna",
      "shrimp", "tilapia", "cod", "steak", "roast", "ribs",
      "bacon", "sausage", "ham", "brisket", "tenderloin", "sirloin",
      "ribeye", "drumstick", "drumsticks", "thigh", "thighs",
      "wing", "wings", "fish",
    ],
    includeAnyPhrases: [
      "chicken breast", "chicken thighs", "chicken drumsticks",
      "ground beef", "ground turkey", "ground pork",
      "sirloin steak", "pork chops", "salmon fillet",
      "raw shrimp", "baby back ribs",
    ],
    excludeAnyTokens: [
      "ramen", "noodle", "noodles", "soup", "broth", "stock",
      "bouillon", "stuffing", "seasoning", "flavor", "flavored",
      "instant", "cup", "bowl", "cracker", "crackers",
      "chip", "chips", "snack",
      "ichiban", "sapporo", "maruchan", "nissin",
      ...ALWAYS_SHELF_STABLE_FISH,
      "canned", "can", "pouch", "packet", "tin", "packed",
      "chunk", "albacore",
      "dog", "cat", "pet", "puppy", "kitten", "feline", "canine",
      "baby", "infant", "toddler", "gerber", "beechnut",
      "pasta", "fettuccini", "fettuccine", "alfredo", "lasagna",
      "macaroni", "linguine", "penne", "rigatoni",
      "condensed",
      "spice", "spices", "powder", "herb", "herbs",
      "cumin", "paprika", "cinnamon", "turmeric", "cayenne", "nutmeg", "cardamom", "coriander"
    ],
    excludeAnyPhrases: [
      "frozen dinner", "cup noodle", "cup noodles",
      "chicken ramen", "beef ramen", "pork ramen",
      "beef stock", "chicken stock", "chicken broth", "beef broth",
      "chicken stuffing", "chicken seasoning",
      "bacon bits", "bacon flavored", "bacon flavor",
      "meal kit", "ramen kit", "dinner kit",
      "chicken soup", "beef soup", "turkey soup",
      "rice and sauce", "rice sauce",
      "in water", "in spring water", "in oil", "packed in",
      "chunk light", "solid white", "ready to eat",
      ...SHELF_STABLE_BRANDS,
      "dog food", "cat food", "dog entree", "cat entree", "pet food",
      "for dogs", "for cats", "heart to tail",
      "baby food", "2nd foods", "nutritious dinner",
      "fettuccini alfredo", "chicken alfredo", "pasta dish",
      "cream of chicken", "cream of mushroom", "cream of celery",
      "condensed soup", "cream of",
      "ground pepper", "ground cumin", "ground cinnamon", "ground paprika",
      "ground turmeric", "ground ginger", "ground cayenne", "ground cloves",
      "ground nutmeg", "ground cardamom", "ground mustard", "ground coriander"
    ],
    customGuard: (name: string, tokens: string[], size: string | null): boolean => {
      const norm = normalizeText(name);

      if (looksLikePetFood(tokens, norm)) return false;
      if (looksLikeBabyFood(tokens, norm)) return false;

      if (looksLikeShelfStableSeafood(tokens, norm, size)) return false;

      if (hasToken(tokens, "frozen")) {
        const frozenProcessedTokens = [
          "nuggets", "tenders", "patties", "patty", "strips", "fingers",
          "popcorn", "bites", "sticks",
        ];
        if (hasAnyToken(tokens, frozenProcessedTokens)) return false;
        if (!hasAnyToken(tokens, POSITIVE_MEAT_SIGNALS)) return false;
      }

      const mealPhrases = [
        "helper", "hamburger helper", "skillet meal",
        "ready meal", "tv dinner",
      ];
      if (hasAnyPhrase(norm, mealPhrases)) return false;
      if (hasToken(tokens, "ham") && !hasPhrase(norm, "ham")) return false;

      if (looksLikeSauceOrCondiment(tokens, norm)) {
        if (hasAnyToken(tokens, POSITIVE_MEAT_SIGNALS)) return true;
        return false;
      }

      if (looksLikePantryInstant(tokens, norm)) {
        if (hasAnyToken(tokens, POSITIVE_MEAT_SIGNALS)) return true;
        return false;
      }

      if (looksLikeSnack(tokens, norm)) return false;

      return true;
    },
  },

  pantry: {
    includeAnyTokens: [
      "rice", "pasta", "bread", "cereal", "flour", "sugar", "oil",
      "vinegar", "beans", "lentils", "oats", "oatmeal", "granola",
      "crackers", "tortillas", "wraps", "noodles",
      "tuna", "sardines", "anchovies", "mackerel",
    ],
    includeAnyPhrases: [
      "peanut butter", "olive oil", "cooking oil",
      "baking soda", "baking powder", "pancake mix", "cake mix",
      "chunk light", "in water", "in oil", "packed in",
      ...SHELF_STABLE_BRANDS,
    ],
    customGuard: (name: string, tokens: string[], size: string | null): boolean => {
      const norm = normalizeText(name);

      if (looksLikePetFood(tokens, norm)) return false;
      if (looksLikeBabyFood(tokens, norm)) return false;

      if (hasAnyToken(tokens, ["tuna", "salmon"])) {
        if (looksLikeShelfStableSeafood(tokens, norm, size)) return true;
        if (hasAnyToken(tokens, FRESH_FISH_SIGNALS)) return false;
      }
      return true;
    },
  },

  beverages: {
    includeAnyTokens: [
      "soda", "cola", "juice", "coffee", "tea", "kombucha",
      "seltzer", "sparkling", "lemonade", "gatorade", "water",
      "pepsi", "coke", "coca", "sprite", "fanta", "7up", "sunkist",
      "crush", "fresca",
    ],
    includeAnyPhrases: [
      "sports drink", "energy drink", "bottled water",
      "sparkling water", "spring water", "drinking water",
      "mineral water", "coconut water",
    ],
    excludeAnyTokens: [
      "filter", "straw", "pitcher", "infuser",
      ...DRINKWARE_TOKENS,
      ...ALWAYS_SHELF_STABLE_FISH, ...SHELF_STABLE_TOKENS,
      "canned",
      "tomatoes",
      "cleaner", "cleaning", "detergent", "dish", "soap", "wipes",
      "spray", "freshener", "scent", "scented", "fragrance",
    ],
    excludeAnyPhrases: [
      "water filter", "water pitcher",
      ...DRINKWARE_PHRASES,
      "in water", "in spring water", "in oil", "packed in",
      "chunk light", "chicken of the sea",
      "in tomato juice", "diced tomatoes", "petite diced",
      "lemon juice", "lime juice", "lemon lime juice",
    ],
    customGuard: (name: string, tokens: string[], size: string | null): boolean => {
      const norm = normalizeText(name);

      if (looksLikeShelfStableSeafood(tokens, norm, size)) return false;

      if (hasPhrase(norm, "water bottle")) {
        if (hasAnyPhrase(norm, [
          "bottled water", "spring water", "drinking water",
          "mineral water", "purified water", "distilled water",
          "coconut water", "alkaline water",
        ])) return true;
        if (looksLikeBeverage(tokens, norm)) return true;
        return false;
      }

      if (looksLikeDrinkware(tokens, norm)) {
        if (looksLikeBeverage(tokens, norm)) return true;
        if (hasAnyPhrase(norm, [
          "spring water", "sparkling water", "bottled water",
          "drinking water", "mineral water", "coconut water",
          "sports drink", "energy drink",
        ])) return true;
        if (hasAnyToken(tokens, ["soda", "juice", "tea", "coffee"])) return true;
        return false;
      }

      return true;
    },
  },

  snacks: {
    includeAnyTokens: [
      ...SNACK_TOKENS, ...SNACK_BRAND_TOKENS,
      "pepperoni", "cookie", "cookies",
    ],
    includeAnyPhrases: [
      "potato chips", "tortilla chips", "corn chips",
      "cheese puffs", "pork rinds", "trail mix",
      "granola bar", "protein bar", "snack pack",
      "variety pack", "meat snack", "toasted rounds",
    ],
    excludeAnyTokens: [
      "soup", "salad", "frozen", "pasta", "sauce", "broth",
      "ramen", "rice", "beans", "oil", "vinegar",
      "firecracker",
    ],
    excludeAnyPhrases: [
      "popcorn chicken", "pepperoni pizza", "frozen pizza",
    ],
    customGuard: (name: string, tokens: string[]): boolean => {
      const norm = normalizeText(name);

      if (looksLikePetFood(tokens, norm)) return false;
      if (looksLikeBabyFood(tokens, norm)) return false;

      if (looksLikeBeverage(tokens, norm)) return false;

      if ((hasToken(tokens, "cracker") || hasToken(tokens, "crackers")) &&
          hasAnyPhrase(norm, ["firecracker", "fire cracker"])) {
        return false;
      }

      if (hasToken(tokens, "pepperoni") && !hasAnyToken(tokens, [
        "snacking", "snack", "rounds", "cracker", "crackers",
        "bites", "jerky", "sticks",
        ...SNACK_BRAND_TOKENS,
      ])) {
        return false;
      }
      if ((hasToken(tokens, "cookie") || hasToken(tokens, "cookies")) && !hasAnyToken(tokens, [
        "snack", "snacks", "pack", "bites", "variety",
        ...SNACK_BRAND_TOKENS,
      ])) {
        return false;
      }
      return true;
    },
  },

  frozen: {
    includeAnyTokens: ["frozen", "popsicle", "popsicles"],
    includeAnyPhrases: [
      "ice cream", "frozen vegetables", "frozen fruit",
      "frozen pizza", "frozen dinner", "frozen meal", "frozen yogurt",
    ],
    excludeAnyPhrases: ["iced tea", "ice tea", "iced coffee"],
  },
};

// =============================================================================
// Subcategory matching logic
// =============================================================================

export function matchesSubcategory(
  productName: string,
  subcategory: string
): boolean {
  const name = productName.toLowerCase();
  switch (subcategory) {
    case "MEAT_RAW":
      return /\b(breast|thigh|thighs|drumstick|drumsticks|wing|wings|leg|legs|loin|chop|chops|roast|brisket|steak|steaks|fillet|fillets|ground|whole|tenderloin|tenderloins|rib|ribs|shank|cutlet|cutlets)\b/.test(name);
    case "MEAT_PROCESSED":
      return /\b(sausage|sausages|link|links|hot\.?dog|hot\.?dogs|bratwurst|bratwursts|bacon|jerky|pepperoni|salami|bologna|pastrami|prosciutto)\b/.test(name);
    case "SEAFOOD_RAW":
      return /\b(fillet|fillets|steak|steaks|whole|raw|fresh|scallop|scallops|shrimp|crab|lobster|tail)\b/.test(name);
    case "SEAFOOD_PROCESSED":
      return /\b(smoked|canned|cooked|surimi|imitation)\b/.test(name);
    case "PRODUCE_WHOLE":
      return !/\b(cut|sliced|chopped|shredded|ready|blend|kit|salad kit)\b/.test(name);
    case "PRODUCE_PREPARED":
      return /\b(cut|sliced|chopped|shredded|ready|blend|kit)\b/.test(name);
    case "DAIRY_MILK":
      return (
        /\b(milk|whole|skim|lowfat|reduced\.?fat|fairlife)\b/.test(name) &&
        !/\b(cheese|butter|cream|yogurt|sour)\b/.test(name)
      );
    case "DAIRY_CREAM":
      return (
        /\b(cream|creamer|half\.?and\.?half|half\.?&\.?half|whipping|eggnog)\b/.test(name) &&
        !/\b(cheese|sour|ice)\b/.test(name)
      );
    case "DAIRY_BUTTER":
      return /\b(butter)\b/.test(name);
    case "DAIRY_YOGURT":
      return /\b(yogurt|kefir)\b/.test(name);
    case "DAIRY_CHEESE":
      return /\b(cheese|mozzarella|cheddar|parmesan|feta|goat|brie|swiss|jack|cottage)\b/.test(name);
    case "DAIRY_SOUR_CREAM":
      return /\b(sour\.?cream)\b/.test(name);
    case "EGGS_STANDARD":
      return (
        /\b(egg|eggs)\b/.test(name) &&
        !/\b(organic|cage\.?free|free\.?range|pasture)\b/.test(name)
      );
    case "EGGS_SPECIALTY":
      return (
        /\b(organic|cage\.?free|free\.?range|pasture)\b/.test(name) &&
        /\b(egg|eggs)\b/.test(name)
      );
    case "BEVERAGES_WATER":
      return /\b(water)\b/.test(name);
    case "BEVERAGES_SODA":
      return /\b(soda|cola|pepsi|coke|sprite|ginger\.?ale|root\.?beer|dr\.?pepper|mountain\.?dew|olipop|poppi)\b/.test(name);
    case "BEVERAGES_JUICE":
      return /\b(juice|lemonade|cider)\b/.test(name);
    case "BEVERAGES_COFFEE":
      return /\b(coffee|espresso|k\.?cup|nespresso|cold\.?brew|roast)\b/.test(name);
    case "BEVERAGES_TEA":
      return /\b(tea|chai)\b/.test(name);
    case "BEVERAGES_ENERGY":
      return /\b(energy|red\.?bull|monster|celsius|alani|rockstar|prime)\b/.test(name);
    case "BEVERAGES_SPORTS":
      return /\b(sport|gatorade|powerade|bodyarmor|liquid\.?iv|pedialyte|hydration)\b/.test(name);
    case "PANTRY_PASTA":
      return /\b(pasta|spaghetti|penne|macaroni|noodle|linguine|fettuccine|rigatoni)\b/.test(name);
    case "PANTRY_PASTA_SAUCE":
      return /\b(marinara|pasta\.?sauce|tomato\.?sauce|arrabiata|bolognese)\b/.test(name);
    case "PANTRY_GRAINS":
      return /\b(rice|quinoa|grain|farro|barley|bulgur|couscous)\b/.test(name);
    case "PANTRY_BREAKFAST":
      return /\b(cereal|oat|oatmeal|granola|pancake|waffle|syrup|pop\.?tart)\b/.test(name);
    case "PANTRY_CONDIMENTS":
      return /\b(ketchup|mustard|mayo|mayonnaise|relish|pickle|hot\.?sauce|bbq|ranch|dressing|soy\.?sauce|teriyaki|salsa)\b/.test(name);
    case "PANTRY_OILS":
      return /\b(oil|vinegar|spray)\b/.test(name);
    case "PANTRY_CANNED":
      return /\b(canned|can|broth|stock|soup|bean|beans|corn|tomato|tuna|spam|chili|pumpkin|applesauce)\b/.test(name);
    case "PANTRY_BAKING":
      return /\b(flour|sugar|honey|baking|vanilla|extract|jam|jelly|peanut\.?butter|nutella|spread)\b/.test(name);
    case "PANTRY_SPICES":
      return /\b(spice|spices|seasoning|salt|pepper|garlic\.?powder|paprika|cumin|cinnamon|herb)\b/.test(name);
    case "PANTRY_NOODLES":
      return /\b(ramen|noodle|noodles|cup\.?noodle)\b/.test(name);
    case "SNACKS_CHIPS":
      return /\b(chip|chips|crisp|crisps|popcorn|pretzel|pretzels|tortilla)\b/.test(name);
    case "SNACKS_CRACKERS":
      return /\b(cracker|crackers|goldfish|cheez\.?it|ritz|triscuit|wheat\.?thin|saltine)\b/.test(name);
    case "SNACKS_COOKIES":
      return /\b(cookie|cookies|oreo|brownie)\b/.test(name);
    case "SNACKS_CANDY":
      return /\b(candy|chocolate|gummy|gummies|sour\.?patch|skittle|starburst|twizzler|nerds|haribo|reese|snicker|kit\.?kat|twix|hershey)\b/.test(name);
    case "SNACKS_NUTS":
      return /\b(nut|nuts|almond|almonds|cashew|cashews|peanut|peanuts|pistachio|pistachios|trail\.?mix|pecan|walnut)\b/.test(name);
    case "SNACKS_BARS":
      return /\b(bar|bars|granola\.?bar|protein\.?bar|kind|clif|rxbar)\b/.test(name);
    case "SNACKS_JERKY":
      return /\b(jerky|meat\.?stick|meat\.?sticks|slim\.?jim|chomps)\b/.test(name);
    case "BAKERY_BREAD":
      return /\b(bread|loaf|baguette|sourdough|ciabatta|brioche|naan|pita|multigrain|rye)\b/.test(name);
    case "BAKERY_ROLLS":
      return /\b(bun|buns|roll|rolls|hawaiian)\b/.test(name);
    case "BAKERY_BAGELS":
      return /\b(bagel|bagels|english\.?muffin)\b/.test(name);
    case "BAKERY_SWEET":
      return /\b(tortilla|tortillas|croissant|muffin|cinnamon\.?roll|donut|danish)\b/.test(name);
    case "FROZEN_MEALS":
      return /\b(pizza|lasagna|burrito|enchilada|pot\.?pie|bowl|meal|entree|entrée|dumpling|potsticker|roll)\b/.test(name);
    case "FROZEN_PRODUCE":
      return /\b(vegetable|vegetables|broccoli|corn|peas|spinach|berry|berries|mango|fruit)\b/.test(name);
    case "FROZEN_SNACKS":
      return /\b(nugget|nuggets|strip|strips|wing|wings|fry|fries|tot|tots|hash\.?brown|fish\.?stick|shrimp)\b/.test(name);
    case "FROZEN_BREAKFAST":
      return /\b(waffle|waffles|pancake|breakfast|sandwich|strudel)\b/.test(name);
    case "DELI_SLICED_MEAT":
      return /\b(sliced|ham|turkey|roast\.?beef|salami|pepperoni|prosciutto|bologna|pastrami)\b/.test(name);
    case "DELI_PREPARED_FOOD":
      return /\b(rotisserie|salad|sushi|coleslaw|macaroni)\b/.test(name);
    case "DELI_SPREADS":
      return /\b(hummus|guacamole|salsa|dip)\b/.test(name);
    case "HH_LAUNDRY":
      return /\b(laundry|detergent|fabric|softener|dryer|bleach|stain|oxiclean)\b/.test(name);
    case "HH_DISH":
      return /\b(dish|dishwasher)\b/.test(name);
    case "HH_CLEANING":
      return /\b(cleaner|disinfect|wipe|wipes|spray|bleach|glass|swiffer|febreze|glade|sponge)\b/.test(name);
    case "HH_PAPER":
      return /\b(toilet|paper\.?towel|tissue|kleenex|puffs|bounty|charmin|cottonelle|brawny)\b/.test(name);
    case "HH_STORAGE":
      return /\b(bag|bags|wrap|foil|ziploc|trash|cup|cups|plate|plates)\b/.test(name);
    case "HB_HAIR":
      return /\b(shampoo|conditioner|hair)\b/.test(name);
    case "HB_SKIN":
      return /\b(body\.?wash|soap|lotion|moisturizer|sunscreen|cleanser|vaseline|chapstick|lip\.?balm)\b/.test(name);
    case "HB_ORAL":
      return /\b(toothpaste|toothbrush|mouthwash|floss|whitening|whitening)\b/.test(name);
    case "HB_DEODORANT":
      return /\b(deodorant|antiperspirant)\b/.test(name);
    case "HB_SHAVING":
      return /\b(razor|razors|shaving|shave)\b/.test(name);
    case "HB_MEDICINE":
      return /\b(tylenol|advil|motrin|aleve|aspirin|excedrin|zyrtec|claritin|allegra|benadryl|flonase|sudafed|mucinex|dayquil|nyquil|robitussin|vicks|halls|tums|pepto|prilosec|imodium|miralax|medicine|relief|cold|flu|allergy|antacid)\b/.test(name);
    case "HB_SUPPLEMENTS":
      return /\b(vitamin|supplement|probiotic|collagen|protein\.?shake|melatonin|multivitamin|fish\.?oil|emergen)\b/.test(name);
    case "HB_FEMININE":
      return /\b(tampon|pad|pads|feminine|kotex|poise)\b/.test(name);
    case "HB_FIRSTAID":
      return /\b(bandage|bandages|neosporin|first\.?aid|q\.?tip|cotton\.?swab)\b/.test(name);
    case "HB_COSMETICS":
      return /\b(mascara|foundation|concealer|lipstick|makeup|cosmetic)\b/.test(name);
    case "BABY_DIAPERS":
      return /\b(diaper|diapers|pull\.?up|training\.?pant)\b/.test(name);
    case "BABY_WIPES":
      return /\b(wipe|wipes)\b/.test(name);
    case "BABY_FORMULA":
      return /\b(formula)\b/.test(name);
    case "BABY_FOOD":
      return /\b(baby\.?food|puree|pouch|pouches|gerber|beech\.?nut|plum|earth\.?best)\b/.test(name);
    case "BABY_CARE":
      return /\b(baby\.?wash|baby\.?shampoo|diaper\.?rash|butt\.?paste)\b/.test(name);
    case "PET_DOG":
      return /\b(dog|canine|puppy|pup)\b/.test(name);
    case "PET_CAT":
      return /\b(cat|feline|kitten)\b/.test(name);
    case "PET_LITTER":
      return /\b(litter)\b/.test(name);
    case "ALCOHOL_BEER":
      return /\b(beer|ale|lager|ipa|stout|porter|seltzer|hard\.?lemonade|twisted\.?tea|malt)\b/.test(name);
    case "ALCOHOL_WINE":
      return /\b(wine|chardonnay|cabernet|merlot|pinot|prosecco|champagne|rosé|rose|sauvignon)\b/.test(name);
    case "ALCOHOL_SPIRITS":
      return /\b(vodka|rum|tequila|whiskey|whisky|bourbon|gin|cognac|brandy|liqueur|scotch)\b/.test(name);
    case "DESSERT_BAKED":
      return /\b(pie|cake|cheesecake|brownie|donut|cookie|pastry)\b/.test(name);
    case "DESSERT_ICE_CREAM":
      return /\b(ice\.?cream|gelato|sorbet|popsicle|klondike|magnum|halo\.?top|frozen\.?yogurt)\b/.test(name);
    case "DESSERT_TOPPING":
      return /\b(whipped\.?cream|cool\.?whip|reddi\.?wip|topping)\b/.test(name);
    case "FLORAL_CUT":
      return /\b(rose|roses|bouquet|sunflower|tulip|flower|flowers)\b/.test(name);
    case "FLORAL_POTTED":
      return /\b(orchid|plant|plants|potted)\b/.test(name);
    case "ALT_MILK_OAT":
      return /\b(oat)\b/.test(name);
    case "ALT_MILK_ALMOND":
      return /\b(almond)\b/.test(name);
    case "ALT_MILK_OTHER":
      return /\b(soy|cashew|coconut|rice|hemp)\b/.test(name);
    default:
      return true;
  }
}

// =============================================================================
// Search-specific relevance filtering
// =============================================================================

const SEARCH_COMPOUND_EXCLUSIONS: Record<string, string[]> = {
  milk: [
    "milk chocolate", "milk duds", "milk bone", "milkbone", "milk bath",
    "malted milk",
    "milk magic",
  ],
  butter: [
    "peanut butter", "almond butter", "cashew butter", "sunflower butter",
    "body butter", "shea butter", "cocoa butter",
    "butter pecan", "butter toffee", "butter cookie", "butter cookies",
    "butter croissant", "butter croissants",
  ],
  cream: [
    "ice cream", "cream soda", "cream puff", "cream pie",
    "cream of mushroom", "cream of chicken", "cream of celery", "cream of",
  ],
  cheese: [
    "cream cheese pizza", "cheese pizza",
    // NOTE: exclusions are matched against normalizeText() output, where all
    // punctuation (& ' -) collapses to spaces. So "&" / "'N" spellings must be
    // written in normalized form ("macaroni cheese", "mac n cheese") — the old
    // "macaroni & cheese" entry could never match and "Mac 'N Cheese" slipped through.
    "mac and cheese", "mac n cheese", "mac cheese",
    "macaroni and cheese", "macaroni cheese",
    "shells and cheese", "shells cheese",
    "nacho cheese doritos", "nacho cheese flavored",
  ],
  yogurt: ["yogurt covered", "yogurt coating", "yogurt raisin"],
  egg: ["egg noodle", "egg noodles", "egg roll", "egg rolls", "egg nog", "egg wash"],
  eggs: ["egg noodles", "egg rolls"],
  chicken: [
    "chicken of the sea", "chicken ramen", "chicken broth", "chicken stock",
    "chicken soup", "chicken seasoning", "chicken stuffing",
    "chicken flavor", "chicken flavored", "chicken dipping sauce",
  ],
  beef: [
    "beef ramen", "beef broth", "beef stock", "beef soup",
    "beef seasoning", "beef flavor", "beef flavored",
  ],
  pork: ["pork ramen", "pork broth", "pork rinds", "pork flavor", "pork flavored"],
  turkey: ["turkey broth", "turkey stock", "turkey soup", "turkey seasoning"],
  salmon: ["salmon oil", "salmon flavor", "salmon flavored"],
  bacon: ["bacon bits", "bacon flavored", "bacon flavor"],
  lemon: ["lemon scent", "lemon scented", "lemon fragrance", "lemon cleaner", "lemon dish"],
  orange: ["orange scent", "orange scented", "orange fragrance", "orange cleaner"],
  lime: ["lime scent", "lime scented"],
  corn: ["corn syrup", "candy corn"],
};

const SEARCH_CONTEXT_EXCLUSION_TOKENS: Record<string, string[]> = {
  milk: [
    "yogurt", "kefir",
    "allergens", "allergen",
    "malted", "candy",
    "whoppers", "balls", "stuffers", "easter", "halloween", "valentine",
    "truffle", "truffles", "fudge", "caramel", "toffee",
    "magic",
    "pancake", "waffle", "sausage", "nuggets", "tenders", "patties",
    "pizza", "burrito", "lasagna",
  ],
  butter: [
    "lotion", "moisturizer", "soap", "shampoo",
  ],
  cream: [
    "lotion", "moisturizer", "soap", "shampoo", "sunscreen",
  ],
  egg: [
    "allergens", "allergen",
  ],
  eggs: [
    "allergens", "allergen",
  ],
};

const NON_GROCERY_CONTEXT_TOKENS = [
  "wash", "lotion", "shampoo", "conditioner", "soap", "cleanser",
  "detergent", "wipes", "freshener", "candle", "moisturizer",
  "serum", "scrub", "exfoliant", "deodorant",
];

export function isProductRelevantForSearch(
  productName: string,
  productSize: string | null,
  searchTerm: string
): boolean {
  const norm = normalizeText(productName);
  const tokens = tokenize(productName);
  const searchTokens = tokenize(searchTerm);

  if (searchTokens.length === 0) return true;

  if (hasAnyToken(tokens, NON_GROCERY_CONTEXT_TOKENS)) return false;

  const hasDirectTokenMatch = searchTokens.every((st) => hasToken(tokens, st));

  for (const st of searchTokens) {
    const exclusions = SEARCH_COMPOUND_EXCLUSIONS[st];
    if (exclusions && hasAnyPhrase(norm, exclusions)) {
      return false;
    }
  }

  if (!hasDirectTokenMatch) {
    for (const st of searchTokens) {
      const contextExclusions = SEARCH_CONTEXT_EXCLUSION_TOKENS[st];
      if (contextExclusions && hasAnyToken(tokens, contextExclusions)) {
        return false;
      }
    }
  }

  return true;
}

export function hasConflictingSecondaryNoun(
  productName: string,
  searchTerm: string,
  expectedCategory: string,
  categoryMap: Record<string, { category: string; subcategory: string | null }>
): boolean {
  const searchTokens = new Set(searchTerm.toLowerCase().trim().split(/\s+/))

  const productTokens = productName.toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)

  for (const token of productTokens) {
    if (searchTokens.has(token)) continue
    if (token.length <= 2) continue

    const cleanToken = token.replace(/[^a-z-]/g, '').trim()
    if (!cleanToken || cleanToken.length <= 2) continue

    const mapping = categoryMap[cleanToken]
    if (!mapping) continue
    if (mapping.category !== expectedCategory) return true
  }

  return false
}
