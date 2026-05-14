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

export interface Task3VacancyMonthHostGroupRow {
  date_month: string | Date
  host_group: string
  room_type: string
  vacancy_rate: number
  available_days: number
  total_days: number
}

export interface Task4MinNightsVacancyBoxRow {
  minimum_nights_group: string
  host_group: string
  q1: number
  median: number
  q3: number
  whisker_low: number
  whisker_high: number
  sample_size: number
}

export interface Task4MinNightsVacancyOutlierRow {
  minimum_nights_group: string
  host_group: string
  listing_id: string
  vacancy_rate: number
}

export interface Task5TopTierLocationRow {
  listing_id: string
  latitude: number | null
  longitude: number | null
  number_of_reviews_ltm: number
  host_is_superhost: boolean
  neighbourhood_cleansed: string
}

export interface Task6HostKpiRow {
  kpi_name: string
  kpi_value: number
  host_performance_group: string
  sample_size: number
}

