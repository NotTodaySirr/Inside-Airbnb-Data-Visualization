"""
Regenerate Task 3 derived files only:
  - task3_daily_host_group_summary.csv
  - task3_intervention_candidates.csv
"""
import pandas as pd
from pathlib import Path

DATA = Path('public/data')
OUT  = DATA / 'derived'
OUT.mkdir(parents=True, exist_ok=True)

LISTINGS = DATA / 'listings_cleaned.csv'
CALENDAR = DATA / 'calendar_cleaned.csv'

def bool_series(s):
    return s.astype(str).str.lower().isin(['true', 't', '1', 'yes'])

print('Loading listings...')
listings = pd.read_csv(LISTINGS, low_memory=False)
listings['id'] = listings['id'].astype(str)

# Task 3 host-group label: Individual vs Commercial
listing_meta_t3 = listings[['id', 'calculated_host_listings_count']].copy()
listing_meta_t3['host_group'] = (
    pd.to_numeric(listing_meta_t3['calculated_host_listings_count'], errors='coerce')
    .fillna(0)
    .apply(lambda x: 'Individual host' if x == 1 else 'Commercial host')
)
meta_t3 = listing_meta_t3.set_index('id')[['host_group']]

print('Reading calendar in chunks...')
t3_daily_parts = []
for chunk in pd.read_csv(
    CALENDAR,
    usecols=['listing_id', 'date', 'available', 'price_used', 'room_type'],
    chunksize=1_000_000,
    low_memory=False
):
    chunk['listing_id'] = chunk['listing_id'].astype(str)
    chunk['available_num'] = bool_series(chunk['available']).astype(int)
    chunk['price_used'] = pd.to_numeric(chunk['price_used'], errors='coerce')
    chunk = chunk.join(meta_t3, on='listing_id')
    chunk = chunk.dropna(subset=['host_group'])
    t3_daily_parts.append(chunk[['listing_id', 'date', 'available_num', 'price_used', 'room_type', 'host_group']])

print('Concatenating...')
t3_full = pd.concat(t3_daily_parts, ignore_index=True)

# Restrict to first 365 calendar dates
all_dates_sorted = sorted(t3_full['date'].dropna().unique())
horizon_dates = set(all_dates_sorted[:365])
t3_365 = t3_full[t3_full['date'].isin(horizon_dates)].copy()
print(f'  365-day window: {len(t3_365):,} rows')

# ── File 1: daily host-group summary ────────────────────────────────────────
grp_cols = ['date', 'host_group', 'room_type']

t3_summary_base = t3_365.groupby(grp_cols, dropna=True).agg(
    total_listing_days=('available_num', 'size'),
    available_days=('available_num', 'sum'),
).reset_index()
t3_summary_base['unavailable_days'] = (
    t3_summary_base['total_listing_days'] - t3_summary_base['available_days']
)
t3_summary_base['availability_rate'] = (
    t3_summary_base['available_days'] / t3_summary_base['total_listing_days']
).round(6)
t3_summary_base['estimated_occupancy_rate'] = (
    1 - t3_summary_base['availability_rate']
).round(6)

t3_price = (
    t3_365.dropna(subset=['price_used'])
    .groupby(grp_cols, dropna=True)
    .agg(
        avg_price_used=('price_used', 'mean'),
        median_price_used=('price_used', 'median'),
        price_sample_size=('price_used', 'count'),
    )
    .reset_index()
)
t3_price['avg_price_used']    = t3_price['avg_price_used'].round(2)
t3_price['median_price_used'] = t3_price['median_price_used'].round(2)

t3_summary = t3_summary_base.merge(t3_price, on=grp_cols, how='left')
t3_summary['price_sample_size'] = t3_summary['price_sample_size'].fillna(0).astype(int)
t3_summary = t3_summary.sort_values(['date', 'host_group', 'room_type'])
t3_summary.to_csv(OUT / 'task3_daily_host_group_summary.csv', index=False)
print(f'  Daily summary: {len(t3_summary)} rows, {t3_summary["date"].nunique()} dates')

# ── File 2: intervention candidates (capped top-20 per date×group×room_type) ─
THRESHOLD = 0.10

t3_cands = t3_365.merge(
    t3_summary[grp_cols + ['median_price_used']].rename(
        columns={'median_price_used': 'group_median_price'}
    ),
    on=grp_cols,
    how='left'
)
t3_cands['price_gap_pct'] = (
    (t3_cands['price_used'] - t3_cands['group_median_price'])
    / t3_cands['group_median_price'].replace(0, float('nan'))
).round(4)

def pricing_signal(row):
    avail = bool(row['available_num'])
    gap   = row['price_gap_pct']
    if pd.isna(gap):
        return 'Monitor'
    if avail and gap > THRESHOLD:
        return 'Consider discount'
    if not avail and gap < -THRESHOLD:
        return 'Consider increase'
    return 'Monitor'

print('Computing pricing signals...')
t3_cands['pricing_signal'] = t3_cands.apply(pricing_signal, axis=1)
t3_cands['available'] = t3_cands['available_num'].astype(bool)

t3_actionable = t3_cands[t3_cands['pricing_signal'] != 'Monitor'].copy()
t3_actionable = t3_actionable[[
    'date', 'listing_id', 'host_group', 'room_type',
    'available', 'price_used', 'group_median_price', 'price_gap_pct', 'pricing_signal'
]].copy()
t3_actionable['abs_gap'] = t3_actionable['price_gap_pct'].abs()
t3_actionable = (
    t3_actionable
    .sort_values(
        ['date', 'host_group', 'room_type', 'pricing_signal', 'abs_gap'],
        ascending=[True, True, True, True, False]
    )
    .groupby(['date', 'host_group', 'room_type'], group_keys=False)
    .head(20)
    .drop(columns=['abs_gap'])
    .sort_values(['date', 'pricing_signal', 'price_gap_pct'], ascending=[True, True, True])
)
t3_actionable.to_csv(OUT / 'task3_intervention_candidates.csv', index=False)
print(f'  Intervention candidates: {len(t3_actionable)} rows (top-20 per group/date)')
print('Done.')
