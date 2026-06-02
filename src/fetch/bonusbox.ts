/**
 * Authenticated Bonus Box transport (api.ah.nl member API).
 *
 * Reads the personal Bonus Box (filterSet APP_BONUS_BOX) and activates picks.
 * All calls go through authGqlFetch, which handles bearer auth + refresh. The
 * raw GraphQL responses are mapped to the domain types in utils/types.ts here.
 */

import { authGqlFetch } from './gql.ts';
import { assertNoGqlErrors } from './transport.ts';
import { BONUS_BOX_ACTIVATE_MUTATION, BONUS_BOX_QUERY, FETCH_MEMBER_QUERY } from './queries.ts';
import { DEFAULT_TIMEOUT_MS } from '../utils/constants.ts';
import { AhNetworkError, AhSourceChangedError } from '../utils/errors.ts';
import { createLogger } from '../utils/log.ts';
import type { BonusBoxActivation, BonusBoxData, BonusBoxItem, MemberInfo } from '../utils/types.ts';

const log = createLogger('fetch/bonusbox');

interface RawPromotion {
  id?: string | null;
  hqId?: string | number | null;
  title?: string | null;
  category?: string | null;
  activationStatus?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  price?: { now?: { amount?: number | null } | null; was?: { amount?: number | null } | null } | null;
}

interface BonusBoxResponse {
  data?: {
    bonusPersonalPromotionBundles?: Array<{
      maximumActivations?: number | null;
      validityPeriod?: { start?: string | null; end?: string | null } | null;
    }> | null;
    bonusPromotions?: RawPromotion[] | null;
  } | null;
  errors?: Array<{ message?: string }> | null;
}

const toItem = (raw: RawPromotion): BonusBoxItem | null => {
  if (!raw.id || raw.hqId == null || !raw.title) return null;
  return {
    id: String(raw.id),
    hqId: String(raw.hqId),
    title: raw.title,
    category: raw.category ?? undefined,
    activationStatus: raw.activationStatus ?? 'UNKNOWN',
    priceNow: raw.price?.now?.amount ?? undefined,
    priceWas: raw.price?.was?.amount ?? undefined,
    periodStart: raw.periodStart ?? undefined,
    periodEnd: raw.periodEnd ?? undefined,
  };
};

export interface BonusBoxPeriod {
  periodStart: string;
  periodEnd: string;
  weekNumber: number;
}

/** Fetch the full personal Bonus Box (activated + activatable items + pick cap). */
export const fetchBonusBox = async (
  period: BonusBoxPeriod,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BonusBoxData> => {
  const response = await authGqlFetch<BonusBoxResponse>(
    'bonusPromotions',
    BONUS_BOX_QUERY,
    { filterSet: 'APP_BONUS_BOX', periodStart: period.periodStart, periodEnd: period.periodEnd, weekNumber: period.weekNumber },
    timeoutMs,
  );
  assertNoGqlErrors(response.errors, 'fetchBonusBox');
  if (!response.data || !('bonusPromotions' in response.data)) {
    throw new AhSourceChangedError('No bonusPromotions field in Bonus Box response');
  }

  const items = (response.data.bonusPromotions ?? []).map(toItem).filter((i): i is BonusBoxItem => i !== null);
  const bundle = response.data.bonusPersonalPromotionBundles?.[0];
  const validity = bundle?.validityPeriod;

  log('Bonus Box:', items.length, 'items, cap', bundle?.maximumActivations);

  return {
    items,
    maximumActivations: bundle?.maximumActivations ?? null,
    activatedCount: items.filter((i) => i.activationStatus === 'ACTIVATED').length,
    validityPeriod: validity?.start && validity?.end ? { start: validity.start, end: validity.end } : undefined,
  };
};

interface ActivateResponse {
  data?: { bonusActivatePersonalPromotion?: { status?: string | null; message?: string | null } | null } | null;
  errors?: Array<{ message?: string }> | null;
}

/**
 * Activate a single Bonus Box pick. `externalId` is the item's `hqId`,
 * `startDate` the bonus period start. One-way: there is no deactivation.
 */
export const activateBonusBoxOffer = async (
  item: Pick<BonusBoxItem, 'id' | 'hqId' | 'title'>,
  startDate: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<BonusBoxActivation> => {
  const externalId = Number(item.hqId);
  if (!Number.isInteger(externalId)) {
    throw new AhNetworkError(`activateBonusBoxOffer: hqId is not an integer (${item.hqId})`);
  }

  const response = await authGqlFetch<ActivateResponse>(
    'bonusActivatePersonalPromotion',
    BONUS_BOX_ACTIVATE_MUTATION,
    { externalId, startDate },
    timeoutMs,
  );
  assertNoGqlErrors(response.errors, `activate ${item.id}`);

  const result = response.data?.bonusActivatePersonalPromotion;
  const status = result?.status ?? 'UNKNOWN';
  const message = result?.message ?? 'no message';
  return { id: item.id, hqId: item.hqId, title: item.title, status, message, ok: status === 'SUCCESS' };
};

interface MemberResponse {
  data?: {
    member?: {
      id?: number | null;
      emailAddress?: string | null;
      name?: { first?: string | null; last?: string | null } | null;
      cards?: { bonus?: string | null } | null;
    } | null;
  } | null;
  errors?: Array<{ message?: string }> | null;
}

/** Fetch the authenticated member's profile — used to verify a login works. */
export const fetchMember = async (timeoutMs = DEFAULT_TIMEOUT_MS): Promise<MemberInfo> => {
  const response = await authGqlFetch<MemberResponse>('FetchMember', FETCH_MEMBER_QUERY, {}, timeoutMs);
  assertNoGqlErrors(response.errors, 'fetchMember');
  const member = response.data?.member;
  if (!member || member.id == null) {
    throw new AhSourceChangedError('No member in FetchMember response');
  }
  return {
    id: member.id,
    email: member.emailAddress ?? undefined,
    firstName: member.name?.first ?? undefined,
    lastName: member.name?.last ?? undefined,
    bonusCard: member.cards?.bonus ?? undefined,
  };
};
