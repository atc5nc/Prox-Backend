# scoring/product_normalizer.py

import re
import logging

logger = logging.getLogger(__name__)

KNOWN_BRANDS: list[str] = sorted([
    # Cereal / Breakfast
    "General Mills", "Kellogg's", "Kelloggs", "Post Consumer Brands",
    "Post", "Quaker", "Malt-O-Meal", "Cascadian Farm", "Nature's Path",
    "Kashi", "Barbara's", "Bob's Red Mill", "Kodiak Cakes", "Kodiak",
    "Honey Nut Cheerios", "Cheerios",
    "Cinnamon Toast Crunch",
    "Frosted Mini-Wheats", "Frosted Mini Wheats",
    "Honey Bunches of Oats",
    "Frosted Flakes", "Froot Loops", "Apple Jacks",
    "Cap'n Crunch", "Capn Crunch", "Lucky Charms", "Corn Flakes",
    "Rice Krispies", "Raisin Bran", "Cocoa Puffs", "Cookie Crisp", "Trix",
    # Snacks — salty
    "Frito-Lay", "Lay's", "Lays", "Doritos", "Cheetos", "Pringles",
    "Ruffles", "Tostitos", "Sun Chips", "Fritos", "Funyuns",
    "Nabisco", "Chips Ahoy!", "Chips Ahoy", "Nutter Butter", "Ritz", "Triscuit",
    "Wheat Thins", "Cheez-It", "Goldfish", "Pepperidge Farm",
    "Cape Cod", "Kettle Brand", "Utz", "Wise", "Old Dutch",
    "Snyder's of Hanover", "Snyder's", "Rold Gold", "Gardetto's",
    "Chex Mix", "PopCorners", "SkinnyPop", "Angie's Boomchickapop",
    "Boomchickapop", "LesserEvil", "Pirate's Booty", "Veggie Straws",
    "Siete", "Late July", "Garden of Eatin'", "Back to Nature",
    "Stacy's", "PopChips", "Terra", "Mondelez",
    "Snack Factory", "Bagel Bites",
    "Orville Redenbacher",
    # Cookies / Crackers
    "Oreo", "Keebler", "Entenmann's", "Entenmanns",
    # Candy / Chocolate
    "Reese's", "Hershey's", "Hersheys", "Hershey", "Kit Kat",
    "Snickers", "M&M's", "M&Ms", "Twix", "Milky Way", "3 Musketeers",
    "Almond Joy", "Mounds", "Butterfinger", "Baby Ruth",
    "Nestle", "Nestlé", "Ghirardelli", "Lindt", "Ferrero",
    "Godiva", "Haribo", "Trolli", "Sour Patch Kids",
    "Swedish Fish", "Skittles", "Starburst", "Jolly Rancher",
    "Werther's", "Brach's", "Russell Stover", "Whitman's",
    "Black Forest",
    # Beverages — soda/water
    "Coca-Cola", "Pepsi-Cola", "Pepsi", "Dr Pepper", "Dr. Pepper",
    "Mountain Dew", "Sprite", "7UP", "7-UP", "Canada Dry",
    "Schweppes", "Fanta", "A&W", "Barq's", "Mug Root Beer",
    "Stewart's", "Jones Soda", "Boylan", "Reed's",
    "LaCroix", "Bubly", "Perrier", "San Pellegrino",
    "Sparkling Ice", "Topo Chico",
    "Waterloo Sparkling Water", "Waterloo",
    "Clear American",
    "Crystal Geyser",
    "Planet Oat",
    # Beverages — juice/sports/energy
    "Gatorade", "Powerade", "BodyArmor", "Body Armor",
    "Red Bull", "Monster Energy", "Monster", "Bang Energy", "Bang",
    "Celsius", "Reign", "Ghost Energy", "Alani Nu",
    "Bloom Nutrition",
    "Minute Maid", "Tropicana", "Simply Orange", "Simply",
    "Ocean Spray", "Welch's", "Capri Sun", "Juicy Juice",
    "Snapple", "Arizona", "Lipton Tea", "Pure Leaf",
    "Bigelow", "Celestial Seasonings", "Tazo",
    "Bai", "Hint", "Vitaminwater", "Vitamin Water",
    "Harmless Harvest", "Zico", "Naked Juice", "Bolthouse Farms",
    "Odwalla", "Evolution Fresh", "V8",
    "Mott's", "Motts", "Tree Top",
    "Yogi Tea", "Yogi",
    "Martinelli's",
    # Beverages — coffee/creamer
    "Folgers", "Maxwell House", "Nescafe", "Nespresso",
    "Starbucks", "Dunkin'", "Dunkin", "Peet's", "Illy", "Lavazza",
    "Death Wish Coffee", "Community Coffee", "Cafe Bustelo",
    "Stok", "Chameleon",
    "Coffee mate", "Coffee-mate",
    "International Delight",
    # Beverages — plant milk
    "Califia Farms", "Oatly", "Silk", "So Delicious",
    "Ripple", "Elmhurst", "Pacific Foods", "Dream", "Almond Breeze",
    "Blue Diamond",
    # Dairy — milk/cream
    "Horizon Organic", "Horizon", "Organic Valley", "Darigold",
    "Prairie Farms", "Hood", "Shamrock Farms", "Garelick Farms",
    "Borden", "Crowley",
    "Alta Dena",
    "Countryside Creamery",
    # Dairy — butter/margarine
    "Kerrygold", "Land O' Lakes", "Land O Lakes", "Challenge",
    "Country Crock", "Smart Balance", "Earth Balance",
    "I Can't Believe It's Not Butter", "Plugra", "Vermont Creamery",
    "Crisco",
    # Dairy — cheese
    "Tillamook", "Sargento", "Cabot", "Philadelphia",
    "Kraft", "Velveeta", "Crystal Farms", "Borden Cheese",
    "BabyBel", "Laughing Cow", "Boursin",
    "Happy Farms",
    # Dairy — yogurt/ice cream
    "Chobani", "Fage", "Yoplait", "Activia", "Stonyfield",
    "Siggi's", "Noosa", "Oikos", "Two Good", "Ratio",
    "Ben & Jerry's", "Haagen-Dazs", "Häagen-Dazs",
    "Breyers", "Blue Bell", "Edy's", "Dreyer's",
    "Turkey Hill", "Friendly's", "Hood Ice Cream",
    "Greek Gods", "good culture",
    "Sundae Shoppe",
    # Dairy — misc
    "Daisy", "Friendship", "Breakstone's", "Knudsen",
    "Friendly Farms", "Sunnyside Farms",
    "Nature's Nectar",
    # Meat / Protein
    "Tyson", "Tyson Any'tizers", "Perdue", "Foster Farms",
    "Hormel", "Oscar Mayer", "Bob Evans", "Jimmy Dean",
    "Hillshire Farm", "Ball Park", "Hebrew National",
    "Johnsonville", "Applegate", "Aidells", "Al Fresco",
    "Boar's Head", "Land O' Frost", "Dietz & Watson",
    "Deli Select", "Butterball", "Jennie-O", "Honeysuckle White",
    "Hatfield", "Farmland",
    "Farmer John", "Just Bare",
    "Appleton Farms", "Kirkwood",
    "ButcherBox",
    "Prima Della",
    "Lunch Mate", "Lunch Buddies",
    # Seafood
    "StarKist", "Chicken of the Sea", "Bumble Bee",
    "Wild Planet", "Safe Catch", "Polar", "Crown Prince",
    "Gorton's", "Van de Kamp's", "Mrs. Paul's",
    "Fremont Fish",
    # Canned / Packaged
    "Campbell's", "Campbells", "Progresso", "Swanson",
    "Heinz", "Hunt's", "Hunts", "Del Monte", "Dole",
    "Green Giant", "Bird's Eye", "Birds Eye",
    "Bush's Beans", "Bush's", "Van Camp's", "Goya",
    "Muir Glen", "Cento", "Tuttorosso", "Red Gold",
    "Amy's", "Annie's", "Pacific Foods",
    "College Inn", "Kitchen Basics", "Better Than Bouillon",
    "La Preferida", "Pueblo Lindo",
    "Happy Harvest", "Chef's Cupboard",
    # Pasta / Rice
    "Barilla", "Ronzoni", "De Cecco", "DeLallo", "Garofalo",
    "Banza", "Jovial", "Tinkyada",
    "Uncle Ben's", "Uncle Bens", "Ben's Original",
    "Minute Rice", "Knorr", "Near East", "Rice-A-Roni",
    "Zatarain's", "Lundberg",
    # Sauces / Condiments
    "Rao's Homemade", "Rao's", "Prego", "Ragú", "Ragu",
    "Bertolli", "Classico", "Newman's Own", "Victoria",
    "Francesco Rinaldi",
    "Kraft Heinz", "Hellmann's", "Hellmans", "Miracle Whip",
    "Duke's", "Sir Kensington's", "Primal Kitchen",
    "French's", "Grey Poupon", "Gulden's",
    "Vlasic", "Claussen", "Mt. Olive",
    "Hidden Valley", "Ken's Steak House", "Ken's",
    "Wish-Bone", "Brianna's", "Marzetti",
    "A.1.", "Lea & Perrins",
    "Frank's RedHot", "Frank's", "Tabasco", "Cholula",
    "Tapatío", "Tapatio", "Valentina", "Huy Fong",
    "Kikkoman", "La Choy", "Thai Kitchen",
    "Lee Kum Kee", "San-J", "Bragg",
    "McCormick", "Lawry's", "Morton",
    "Tony Chachere's", "Old Bay",
    "Spice World",
    "Mission",
    # Peanut butter / Spreads / Jams
    "Jif", "Skippy", "Peter Pan", "Justin's", "RxBar Nut Butter",
    "Smucker's", "Smuckers", "Bonne Maman",
    "Welch's", "Polaner", "Stonewall Kitchen",
    "Peanut Butter & Co",
    # Bread / Baked
    "Dave's Killer Bread", "Nature's Own", "Nature's Harvest",
    "Thomas'", "Thomas's", "Sara Lee", "Arnold",
    "Pepperidge Farm", "Oroweat", "Martin's", "King's Hawaiian",
    "Pillsbury", "Betty Crocker", "Duncan Hines",
    "Bisquick", "Jiffy", "Bob's Red Mill",
    "L'oven Fresh", "Wonder Bread",
    # Flour / Cooking
    "King Arthur Baking Company", "King Arthur",
    "Gold Medal",
    "Just About Foods",
    # Frozen
    "Stouffer's", "Stouffers", "Lean Cuisine", "Healthy Choice",
    "Marie Callender's", "Banquet",
    "Ore-Ida", "Alexia", "Farm Rich", "TGI Friday's",
    "Devour", "P.F. Chang's", "Tai Pei",
    "DiGiorno", "Red Baron", "Tombstone", "Jack's Pizza",
    "Amy's", "EVOL",
    "Eggo",
    "Summit Popz",
    # Snack / Nutrition bars
    "Clif Bar", "Clif", "Kind", "RxBar", "Rx Bar",
    "Nature Valley", "Larabar", "LÄRABAR",
    "Quest", "ONE Bar", "Think!", "thinkThin",
    "Fiber One", "Special K Bar",
    "Clif Kid", "Zbar",
    # Supplements / Health
    "Ensure", "Boost", "Glucerna", "Pedialyte", "Muscle Milk",
    "Orgain", "Premier Protein", "Fairlife",
    "Serenity Kids",
    # Baby / Kids
    "Gerber", "Enfamil", "Similac", "Earth's Best",
    "Pampers", "Huggies", "Luvs",
    "Happy Baby",
    "Parent's Choice", "Millie Moon",
    "Beech-Nut",
    # Pet
    "Blue Buffalo", "Purina Pro Plan", "Purina One", "Purina",
    "Iams", "Pedigree", "Hill's Science Diet", "Hill's",
    "Royal Canin", "Fancy Feast", "Friskies",
    "Meow Mix", "Whiskas", "Temptations",
    "Beggin'", "Milk-Bone", "Greenies", "Nylabone",
    # Hair Care / Personal Care
    "TRESemmé", "Tresemme", "Suave", "Aussie", "OGX",
    "Harry's", "Flamingo",
    "BIC", "Old Spice",
    # Health / Beauty / Household
    "Head & Shoulders", "Herbal Essences", "Arm & Hammer",
    "Neutrogena", "Cetaphil", "Aveeno", "Olay", "CeraVe",
    "L'Oreal", "Loreal", "Garnier", "Pantene", "Clairol",
    "Colgate", "Crest", "Oral-B", "Listerine", "Scope",
    "Gillette", "Schick", "Venus", "Dove",
    "Tide", "Gain", "Downy", "Bounce", "Persil", "All",
    "Dawn", "Palmolive", "Ajax", "Cascade",
    "Bounty", "Charmin", "Cottonelle", "Scott",
    "Kleenex", "Puffs", "Viva",
    "Ziploc", "Glad", "Reynolds",
    "Angel Soft", "Quilted Northern",
    "Seventh Generation",
    "La Banderita",
    "Lunch Mate",
    "Hefty",
    "Vicks",
    # Tea
    "Stash Tea", "Stash",
    # Private label / store brands
    "Great Value", "Market Pantry", "Good & Gather",
    "Simply Balanced", "Kirkland Signature", "Kirkland",
    "Simple Truth", "Private Selection",
    "Specially Selected", "SimplyNature",
    "Trader Joe's",
    "Wellsley Farms",
    "Bowl & Basket", "Our Family", "First Street",
    "Hampshire", "Wegmans",
    "Signature SELECT",
    "Freshness Guaranteed",
    "O Organics",
    "bettergoods",
    "Marketside",
    "Member's Mark",
    "Stater Bros.",
    "Food Lion",
    # ALDI store brands
    "Southern Grove",
    "Season's Choice",
    "Mama Cozzi's",
    "Sundae Shoppe",
    "Breakfast Best",
    "Little Journey",
    "Crofton",
    "Never Any!",
    "Millville",
    "Fit & Active",
    "liveGfree",
    "KIRKTON HOUSE",
    "Chef's Cupboard",
    "Appleton Farms",
    "Happy Farms",
    "Fremont Fish",
    "Happy Harvest",
    "Countryside Creamery",
    "Kirkwood",
    "Summit Popz",
    # Additional brands
    "International Delight", "Land O'Lakes",
    "Smash Foods", "PLANTSTRONG",
    # Store brands
    "Equate", "Kroger", "Kroger®", "Publix", "Lucerne",
    "Benner", "Essential Everyday",
    # ALDI store brands (additional)
    "Clancy's", "Savoritz", "Burman's", "Reggano", "Priano", "Benton's",
    "PurAqua", "Stonemill", "Barissimo", "Berryhill",
    "Park Street Deli", "Little Salad Bar", "Heart to Tail",
    # Health / Medicine
    "Sensodyne", "Robitussin", "Tylenol", "Mucinex", "Advil",
    "Lactaid", "HALLS", "Halls",
    # Beverages (additional)
    "Lipton", "Twinings", "Luzianne",
    "smartwater", "Poland Spring", "Pure Life",
    "SUNNYD", "SunnyD",
    "poppi", "OLIPOP",
    "C4 Energy", "C4",
    "WellWithAll",
    "Apple & Eve",
    "Florida's Natural",
    "VitaCup",
    "Wyman's",
    # Food brands
    "Guerrero", "Calidad", "Casa Mamita", "Romero's",
    "Tortilla Land",
    "Smithfield",
    "Sanderson Farms",
    "Idahoan",
    "Mahatma",
    "NatureSweet",
    "SunVista",
    "Wesson", "Pompeian",
    "C&H",
    "Baker's",
    "Mezzetta",
    "Sun-Maid",
    "Old El Paso",
    "Reser's",
    "Van's Foods", "Van's",
    "Dot's Homestyle", "Dot's",
    "Jones Dairy Farm",
    "Pop Secret",
    "Kettle & Fire",
    "Santa Cruz Organic", "Santa Cruz",
    "Straus Family Creamery",
    "California Pizza Kitchen",
    "Thrifty Ice Cream", "Thrifty",
    "Ingrilli",
    "Power Up",
    "Once Upon a Farm",
    # Personal care (additional)
    "Native",
    "Degree",
    "Secret",
    "Mrs. Meyer's", "Mrs. Meyers",
    "ECOS",
    "Sparkle",
    # Baby
    "Hello Bello",
    # Coffee
    "Black Rifle Coffee Company", "Black Rifle",
    "Barissimo",
    # Other
    "The Honest Company",
    "Cadbury", "CADBURY",
    "NY Spice Shop",
    "Bloom Nutrition",
    "Priano",
], key=lambda b: -len(b))


_FILLER_PATTERNS = [
    r"\bfamily size\b", r"\bjumbo size\b", r"\bvalue size\b",
    r"\bking size\b", r"\bsnack size\b", r"\bparty size\b",
    r"\bsuper size\b", r"\bbulk size\b",
    r"\(\d+\s*(?:box|boxes|pack|pk)\)", r"\bpack of \d+\b",
    r"\b\d+\s*(?:count|ct|pk|pack)\b",
    r"\bbreakfast cereal\b", r"\bkids cereal\b", r"\bfamily breakfast\b",
    r"\bcereal\b",
    r"\bgood source of fiber\b", r"\bhigh protein\b", r"\bhigh fiber\b",
    r"\bfat free\b", r"\blow fat\b", r"\bsugar free\b",
    r"\bwhole grain[s]?\b", r"\bwhole grains[^,]*",
    r"\bgluten.?free\b",
    r"\bnatural\b", r"\boriginal\b", r"\bclassic\b",
    r"\breduced fat\b", r"\breduced sodium\b", r"\blow sodium\b",
    r"\bready to eat\b",
    r"\bpure\b",
    r"\brefrigerated\b",
    r"\d+(\.\d+)?\s*fluid\s*ounce[s]?\b",
    r"\bhypoallergenic\b", r"\bsensitive skin\b",
    r"\bno sugar added\b", r"\blow calorie\b", r"\blow-calorie\b",
    r"\bvegan\b", r"\borganic\b",
    r"\bshelf stable\b", r"\bextended shelf life\b",
    r"\b\d{3,4}\b(?!\s*(?:oz|lb|g|ml|fl|count|ct|pk|pack|liter|gram))",
    r"\bbox\b", r"\bbag\b", r"\bcan\b", r"\bjar\b", r"\bbottle\b",
    r"\bpouch\b", r"\bcarton\b", r"\bcontainer\b", r"\bcanister\b",
    r"\btub\b", r"\bwrap\b", r"\btin\b",
    r"[-–]\s*\d+(\.\d+)?\s*(?:oz|lb|g|ml|fl\.?\s*oz)\b",
    r"\d+(\.\d+)?\s*(?:oz|lb|g|ml|fl\.?\s*oz|ounce|pound|gram|liter)\b",
]

_FILLER_RE = re.compile("|".join(_FILLER_PATTERNS), flags=re.IGNORECASE)

_SIZE_IN_NAME_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(oz|fl\.?\s*oz|g|gram|lb|pound|ml|liter)\b",
    re.IGNORECASE,
)

_G_TO_OZ  = 0.035274
_LB_TO_OZ = 16.0
_ML_TO_OZ = 0.033814
_L_TO_OZ  = 33.814
_MIN_REAL_SIZE_OZ = 1.5
_TRAILING_BRAND_SEP = " - "


def _to_oz(amount: float, unit: str) -> float | None:
    u = unit.lower().replace(" ", "").replace(".", "")
    if u in ("oz", "floz"):    return round(amount, 2)
    if u in ("g", "gram"):     return round(amount * _G_TO_OZ, 2)
    if u in ("lb", "pound"):   return round(amount * _LB_TO_OZ, 2)
    if u in ("ml",):           return round(amount * _ML_TO_OZ, 2)
    if u in ("l", "liter"):    return round(amount * _L_TO_OZ, 2)
    return None


def _normalize_apostrophes(text: str) -> str:
    return text.replace("\u2019", "'").replace("\u2018", "'")


def _strip_trademark(text: str) -> str:
    return text.rstrip("™®\u2122\u00ae").strip()


def _truncate_bulk_description(name: str) -> str:
    if "|" in name:
        name = name.split("|")[0].strip()
    if "," in name:
        parts = name.split(",")
        first = parts[0].strip()
        rest  = ",".join(parts[1:]).strip()
        if len(first.split()) <= 8 and len(rest) > 20:
            name = first
    if " -- " in name:
        name = name.split(" -- ")[0].strip()
    return name


def extract_brand(product_name: str) -> str | None:
    lower = _normalize_apostrophes(product_name).strip().lower()
    for brand in KNOWN_BRANDS:
        if lower.startswith(brand.lower()):
            return brand.lower()
    if _TRAILING_BRAND_SEP in lower:
        segments = lower.split(_TRAILING_BRAND_SEP)
        for segment in segments[1:]:
            segment = _strip_trademark(segment).strip()
            for brand in KNOWN_BRANDS:
                if segment.startswith(brand.lower()):
                    return brand.lower()
    return None


def build_canonical_name(product_name: str, brand: str | None) -> str:
    name = _normalize_apostrophes(product_name).lower().strip()
    original_name = name
    name = _truncate_bulk_description(name)
    if brand and name.startswith(brand.lower()):
        name = name[len(brand):].lstrip(" ,-")
    if brand and _TRAILING_BRAND_SEP in name:
        parts = name.split(_TRAILING_BRAND_SEP)
        cleaned = [
            p for p in parts
            if not _strip_trademark(p).strip().startswith(brand.lower())
        ]
        name = " ".join(cleaned).strip(" -")
    name = _FILLER_RE.sub(" ", name)
    name = re.sub(r"[®™''\-–/\\|()[\]{}]", " ", name)
    name = re.sub(r"(\d)%", r"\1pct", name)   # preserve fat % e.g. 0% → 0pct temporarily
    name = re.sub(r"[^a-z0-9\s]", "", name)
    name = re.sub(r"(\d)pct", r"\1%", name)   # restore % after stripping other special chars
    name = re.sub(r"\s+", " ", name).strip()
    name = re.sub(r"\b(with|and|or|in|of|for|the|a|an)\s*$", "", name).strip()
    name = re.sub(r"^(with|and|or|in|of|for|the|a|an)\b\s*", "", name).strip()
    if not name and brand:
        name = brand
    # Preserve product form in the identity.  Removing package words such as
    # "can" must not merge canned chicken/fish with raw or fresh products.
    form_prefix = None
    if re.search(
        r"\b(canned|tinned|pouched)\b|\b(in water|in oil)\b",
        original_name,
    ):
        form_prefix = "canned"
    elif re.search(
        r"\b(prepared|ready[- ]to[- ]eat|parmesan[- ]crusted|"
        r"tortellini|enchilada|casserole|lasagna|lasagne)\b",
        original_name,
    ):
        form_prefix = "prepared"
    if form_prefix and not name.startswith(f"{form_prefix} "):
        name = f"{form_prefix} {name}".strip()
    _SORTABLE_BRANDS = {
        "cheerios", "eggo", "oreo", "wheaties", "trix",
        "kix", "chex", "clif", "rxbar",
    }
    words = name.split()
    if len(words) <= 4 and any(w in _SORTABLE_BRANDS for w in words):
        name = " ".join(sorted(words))
    return name


def normalize_size_oz(
    base_amount: float | str | None,
    base_unit:   str | None,
    product_name: str,
) -> float | None:
    db_oz = None
    if base_amount is not None and base_unit:
        try:
            db_oz = _to_oz(float(base_amount), base_unit)
        except (ValueError, TypeError):
            pass
    name_candidates = []
    for amt_str, unit in _SIZE_IN_NAME_RE.findall(product_name):
        oz = _to_oz(float(amt_str), unit)
        if oz and oz >= _MIN_REAL_SIZE_OZ:
            name_candidates.append(oz)
    name_oz = max(name_candidates) if name_candidates else None
    if db_oz and db_oz >= _MIN_REAL_SIZE_OZ:
        return db_oz
    if name_oz:
        return name_oz
    return db_oz


def make_match_key(
    product_name: str,
    base_amount:  float | str | None,
    base_unit:    str | None,
) -> dict:
    brand     = extract_brand(product_name)
    canonical = build_canonical_name(product_name, brand)
    size_oz   = normalize_size_oz(base_amount, base_unit, product_name)
    if brand and canonical and size_oz:
        key, confidence = f"{brand}|{canonical}|{size_oz}", "high"
    elif brand and canonical:
        key, confidence = f"{brand}|{canonical}|no_size", "medium"
    elif canonical and size_oz:
        key, confidence = f"unknown_brand|{canonical}|{size_oz}", "low"
    else:
        key, confidence = None, "none"
    return {
        "brand":          brand,
        "canonical_name": canonical,
        "size_oz":        size_oz,
        "match_key":      key,
        "confidence":     confidence,
    }