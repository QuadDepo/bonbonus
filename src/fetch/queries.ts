/**
 * GraphQL query strings for the Albert Heijn bonus API.
 *
 * BONUS_CATEGORIES_QUERY — fetches the list of bonus categories and their
 * promotions for a given week. Called once per scrape to discover all active
 * promotions.
 *
 * BONUS_PROMOTION_PRODUCTS_QUERY — fetches the products belonging to a single
 * promotion. Called once per promotion (fan-out from the categories response).
 */

export const BONUS_CATEGORIES_QUERY = `query bonusCategories($input: PromotionSearchInput) {
  bonusCategories(filterSet: WEB_CATEGORIES, input: $input) {
    id
    title
    type
    promotions {
      ...promotion
      __typename
    }
    __typename
  }
}

fragment promotion on Promotion {
  id
  title
  productCount
  periodStart
  periodEnd
  __typename
}`;

export const BONUS_PROMOTION_PRODUCTS_QUERY = `query bonusPromotionProducts($id: String, $orderId: Int, $hideVariants: Boolean, $periodStart: String, $periodEnd: String, $viewDate: String) {
  bonusPromotions(
    input: {id: $id, orderId: $orderId, hideVariants: $hideVariants, viewDate: $viewDate}
  ) {
    products {
      ...product
      priceV2(
        periodStart: $periodStart
        periodEnd: $periodEnd
        forcePromotionVisibility: true
      ) {
        ...priceV2
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment product on Product {
  id
  hqId
  title
  brand
  category
  webPath
  minBestBeforeDays
  salesUnitSize
  interactionLabel
  isSample
  isMedicine
  isMedicalDevice
  highlight
  highlights
  summary
  shopType
  privateLabel
  listPrice {
    amount
    __typename
  }
  imagePack(angles: [ANGLE_2D1, HERO]) {
    angle
    small {
      height
      url
      width
      __typename
    }
    __typename
  }
  availability {
    ...availability
    __typename
  }
  taxonomies {
    id
    name
    active
    parents
    __typename
  }
  tradeItem {
    gtin
    gtinRevisions
    __typename
  }
  virtualBundleProducts {
    quantity
    __typename
  }
  variant {
    ...variant
    __typename
  }
  variants {
    ...variant
    __typename
  }
  icons
  properties {
    code
    values
    __typename
  }
  __typename
}

fragment availability on ProductAvailability {
  isOrderable
  isVisible
  online {
    status
    availableFrom
    __typename
  }
  unavailableForOrder {
    status
    __typename
  }
  availabilityLabel
  maxUnits
  __typename
}

fragment variant on ProductVariant {
  label
  type
  product {
    id
    hqId
    title
    brand
    category
    listPrice {
      amount
      __typename
    }
    salesUnitSize
    isSample
    highlight
    imagePack(angles: [ANGLE_2D1, HERO]) {
      angle
      small {
        height
        url
        width
        __typename
      }
      __typename
    }
    priceV2(
      periodStart: $periodStart
      periodEnd: $periodEnd
      forcePromotionVisibility: true
    ) {
      ...priceV2
      __typename
    }
    properties {
      code
      values
      __typename
    }
    availability {
      ...availability
      __typename
    }
    __typename
  }
  __typename
}

fragment priceV2 on ProductPriceV2 {
  now {
    amount
    __typename
  }
  was {
    amount
    __typename
  }
  unitInfo {
    price {
      amount
      __typename
    }
    description
    __typename
  }
  discount {
    segmentId
    description
    promotionType
    segmentType
    subtitle
    theme
    tieredOffer
    wasPriceVisible
    smartLabel
    __typename
  }
  __typename
}`;

// Search-context fragment for Product. Distinct from the bonus-promotion
// fragment above because:
// 1. No `priceV2(periodStart, periodEnd)` args — search results use the
//    current effective price, not a period-locked one.
// 2. Trimmed selection set — we do not need taxonomies, variants, or
//    bundle metadata for search/lookup commands.
const SEARCH_PRODUCT_FRAGMENT = `fragment searchProduct on Product {
  id
  hqId
  title
  brand
  category
  webPath
  salesUnitSize
  highlights
  icons
  imagePack(angles: [ANGLE_2D1, HERO]) {
    angle
    small { url }
  }
  availability {
    availabilityLabel
    isOrderable
  }
  tradeItem { gtin }
  priceV2 {
    now { amount }
    was { amount }
    unitInfo {
      description
      price { amount }
    }
    discount {
      description
      smartLabel
      theme
      promotionType
      subtitle
    }
  }
}`;

export const PRODUCT_SEARCH_QUERY = `query productSearch($input: ProductSearchInput!) {
  productSearch(input: $input) {
    products { ...searchProduct }
  }
}
${SEARCH_PRODUCT_FRAGMENT}`;

export const PRODUCTS_QUERY = `query products($productsInput: [ProductsInput!]!) {
  products(productsInput: $productsInput) {
    ...searchProduct
  }
}
${SEARCH_PRODUCT_FRAGMENT}`;

// RecipeSummary on the public web endpoint exposes a slim set of fields.
// Steps, nutrition, totalTime, and the ingredient list live on the mobile
// `api.ah.nl/graphql` schema (Phase 3 if/when we add that transport).
export const RECIPE_SEARCH_QUERY = `query recipeSearch($query: RecipeSearchParams!) {
  recipeSearch(query: $query) {
    result {
      id
      title
      slug
      rating { average }
      courses
      diet
    }
  }
}`;
