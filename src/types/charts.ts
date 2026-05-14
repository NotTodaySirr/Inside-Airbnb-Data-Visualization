import type { ComponentType } from 'react'

export type ChartId = 'task1' | 'task2' | 'task3' | 'task4' | 'task5' | 'task6'

export interface ChartDefinition {
  id: ChartId
  title: string
  taskText: string
  idiom: string
  dataUrl: string
  component: ComponentType
}

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: string }

export interface Task1PriceRatingCorrRow {
  neighbourhood_cleansed: string
  room_type: string
  pearson_r: number
  sample_size: number
  avg_price_clean: number
  avg_review_scores_rating: number
}

export interface Task1PriceRatingCorrBarRow extends Task1PriceRatingCorrRow {
  group_label: string
}

export interface Task2ReviewMonthRoomTypeRow {
  review_month: string | Date
  room_type: string
  review_count: number
}

// New seasonality types (2-file architecture)
export interface Task2BarSummaryRow {
  review_year: number
  month_num: number
  month_label: string
  room_type: string
  review_count: number
}

export interface Task2ListingDetailRow {
  review_year: number
  month_num: number
  month_label: string
  listing_id: string
  name: string
  room_type: string
  neighbourhood_cleansed: string
  review_count: number
  review_scores_rating: number | null
  price: number | null
  number_of_reviews_ltm: number
}

export interface Task3VacancyMonthHostGroupRow {
  date_month: string | Date
  host_group: string
  room_type: string
  vacancy_rate: number
  available_days: number
  total_days: number
}

export interface Task3DailyHostGroupRow {
  date: string
  host_group: string
  room_type: string
  total_listing_days: number
  available_days: number
  unavailable_days: number
  availability_rate: number
  estimated_occupancy_rate: number
  avg_price_used: number | null
  median_price_used: number | null
  price_sample_size: number
}

export interface Task3InterventionRow {
  date: string
  listing_id: string
  host_group: string
  room_type: string
  available: boolean
  price_used: number | null
  group_median_price: number | null
  price_gap_pct: number | null
  pricing_signal: 'Consider discount' | 'Consider increase' | 'Monitor'
}

export interface Task4MinNightsVacancyBoxRow {
  minimum_nights_group: string
  price_setting_group: 'High fixed price' | 'Normal/lower fixed price'
  q1: number
  median: number
  q3: number
  whisker_low: number
  whisker_high: number
  sample_size: number
  baseline_median_vacancy: number
  vacancy_lift_pp: number
}

export interface Task4SupportCandidateRow {
  support_priority_rank: number
  listing_id: string
  name: string
  neighbourhood_cleansed: string
  room_type: string
  minimum_nights: number
  price: number
  peer_median_price: number
  price_gap_pct: number
  available_days: number
  total_days: number
  vacancy_rate: number
  support_reason: string
}

/** @deprecated Replaced by Task4SupportCandidateRow. */
export interface Task4MinNightsVacancyOutlierRow {
  minimum_nights_group: string
  host_group: string
  listing_id: string
  vacancy_rate: number
}

/** Listing-level row from task5_spatial_listings.csv (active listings only). */
export interface Task5SpatialListingRow {
  listing_id: string
  name: string
  latitude: number
  longitude: number
  neighbourhood_cleansed: string
  borough: string
  room_type: string
  price: number | null
  review_scores_rating: number | null
  number_of_reviews_ltm: number
  host_is_superhost: boolean
  host_group: 'Superhost' | 'Regular host'
}

/**
 * Neighbourhood-level Superhost acquisition gap row.
 * Computed client-side from Task5SpatialListingRow filtered to active top-tier listings.
 */
export interface Task5SuperhostGapRow {
  neighbourhood_cleansed: string
  campaign_candidates: number
  top_tier_superhosts: number
  superhost_share: number
  avg_reviews_ltm: number
  gap_score: number
}

/** @deprecated Replaced by Task5SpatialListingRow. Kept for reference only. */
export interface Task5NeighbourhoodOpportunityRow {
  neighbourhood_cleansed: string
  borough: string
  opportunity_score: number
  avg_price: number
  listing_count: number
  avg_availability_pct: number
  avg_reviews_ltm: number
  dominant_room_type: string
  total_reviews: number
}

export interface Task5FilterState {
  borough: string
  roomType: string
  percentile: number
}

export interface Task6HostKpiRow {
  kpi_name: string
  kpi_value: number
  host_performance_group: string
  sample_size: number
}

