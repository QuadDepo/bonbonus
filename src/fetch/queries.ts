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
