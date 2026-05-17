"""
Regenerate Task 4 derived files only:
  - task4_min_nights_vacancy_box.csv
  - task4_support_candidates.csv

Scope:
  - Single-property hosts: calculated_host_listings_count == 1
  - Valid, non-outlier listing price (price_missing == False AND is_price_outlier == False)

Color dimension on the box plot is `price_setting_group` (not host_group):
  - "High fixed price"        : listing price >= 1.25 * median(price | room_type)
  - "Normal/lower fixed price": all other valid prices

Vacancy is computed from calendar_cleaned.csv:
  vacancy_rate = available_days / total_days   (per listing, over the full horizon)

Support candidate rule:
  minimum_nights >= 30
  AND price_setting_group == "High fixed price"
  AND vacancy_rate >= 0.80
"""
import json
import pandas as pd
from pathlib import Path

DATA = Path('public/data')
OUT  = DATA / 'derived'
OUT.mkdir(parents=True, exist_ok=True)

LISTINGS = DATA / 'listings_cleaned.csv'
CALENDAR = DATA / 'calendar_cleaned.csv'
GEOJSON = DATA / 'neighbourhoods.geojson'

HIGH_PRICE_RATIO = 1.25
SUPPORT_MIN_NIGHTS = 30
SUPPORT_VACANCY_FLOOR = 0.80
TOP_CANDIDATES = 10  # for display, but we still write the full list


def bool_series(s):
    return s.astype(str).str.lower().isin(['true', 't', '1', 'yes'])


def min_nights_group(v):
    if pd.isna(v):
        return None
    v = float(v)
    if v <= 2:
        return '1-2 nights'
    if v <= 6:
        return '3-6 nights'
    if v <= 29:
        return '7-29 nights'
    return '30+ nights'


def load_borough_map():
    with open(GEOJSON, encoding='utf-8') as f:
        geo = json.load(f)
    out = {}
    for feat in geo.get('features', []):
        props = feat.get('properties', {})
        neighbourhood = props.get('neighbourhood') or props.get('neighbourhood_cleansed')
        borough = props.get('neighbourhood_group') or props.get('neighbourhood_group_cleansed')
        if neighbourhood and borough:
            out[neighbourhood] = borough
    return out


# ── Load listings & filter to single-property hosts with valid price ────────
print('Loading listings...')
listings = pd.read_csv(LISTINGS, low_memory=False)
listings['id'] = listings['id'].astype(str)
listings['borough'] = listings['neighbourhood_cleansed'].map(load_borough_map()).fillna('Unknown')
listings['price_clean'] = pd.to_numeric(listings['price'], errors='coerce')
listings['minimum_nights_num'] = pd.to_numeric(listings['minimum_nights'], errors='coerce')
listings['host_listings_count_num'] = pd.to_numeric(
    listings['calculated_host_listings_count'], errors='coerce'
)

valid_price = (
    listings['price_clean'].notna()
    & ~bool_series(listings['price_missing'])
    & ~bool_series(listings['is_price_outlier'])
)
single_host = listings['host_listings_count_num'] == 1

t4 = listings[valid_price & single_host & listings['minimum_nights_num'].notna()].copy()
print(f'  Single-property listings with valid price: {len(t4):,}')

# ── Derive minimum_nights_group + price_setting_group ───────────────────────
t4['minimum_nights_group'] = t4['minimum_nights_num'].apply(min_nights_group)

peer_median = t4.groupby('room_type')['price_clean'].median().rename('peer_median_price')
t4 = t4.merge(peer_median, on='room_type', how='left')
t4['price_gap_pct'] = (t4['price_clean'] - t4['peer_median_price']) / t4['peer_median_price']
t4['price_setting_group'] = (
    (t4['price_clean'] >= HIGH_PRICE_RATIO * t4['peer_median_price'])
    .map({True: 'High fixed price', False: 'Normal/lower fixed price'})
)

# ── Compute per-listing vacancy from calendar (chunked) ─────────────────────
print('Reading calendar in chunks for vacancy...')
keep_ids = set(t4['id'].tolist())

vac_parts = []
for chunk in pd.read_csv(
    CALENDAR,
    usecols=['listing_id', 'date', 'available'],
    chunksize=1_500_000,
    low_memory=False,
):
    chunk['listing_id'] = chunk['listing_id'].astype(str)
    chunk = chunk[chunk['listing_id'].isin(keep_ids)]
    if chunk.empty:
        continue
    chunk['available_num'] = bool_series(chunk['available']).astype(int)
    vac_parts.append(
        chunk.groupby('listing_id', dropna=True)
             .agg(available_days=('available_num', 'sum'),
                  total_days=('available_num', 'size'))
             .reset_index()
    )

vacancy = (
    pd.concat(vac_parts, ignore_index=True)
      .groupby('listing_id', as_index=False)
      .sum()
)
vacancy['vacancy_rate'] = vacancy['available_days'] / vacancy['total_days']
print(f'  Vacancy rows: {len(vacancy):,}')

t4 = t4.merge(vacancy, left_on='id', right_on='listing_id', how='inner')
t4 = t4.dropna(subset=['vacancy_rate', 'minimum_nights_group', 'price_setting_group'])
print(f'  Listings with vacancy data: {len(t4):,}')

# ── Box-plot rows, scoped for global borough + room-type filters ────────────
box_rows = []

def add_box_rows(scope, borough, room_type):
    rows_start = len(box_rows)
    for (mn, pg), g in scope.groupby(['minimum_nights_group', 'price_setting_group']):
        if len(g) == 0:
            continue
        q1, med, q3 = g['vacancy_rate'].quantile([0.25, 0.5, 0.75])
        iqr = q3 - q1
        low = max(0.0, q1 - 1.5 * iqr)
        high = min(1.0, q3 + 1.5 * iqr)
        box_rows.append({
            'borough': borough,
            'room_type': room_type,
            'minimum_nights_group': mn,
            'price_setting_group': pg,
            'q1': round(float(q1), 6),
            'median': round(float(med), 6),
            'q3': round(float(q3), 6),
            'whisker_low': round(float(low), 6),
            'whisker_high': round(float(high), 6),
            'sample_size': int(len(g)),
        })

    # Baseline = median vacancy of (1-2 nights, Normal/lower fixed price)
    scoped_rows = box_rows[rows_start:]
    baseline_rows = [
        row for row in scoped_rows
        if row['minimum_nights_group'] == '1-2 nights'
        and row['price_setting_group'] == 'Normal/lower fixed price'
    ]
    baseline = baseline_rows[0]['median'] if baseline_rows else float('nan')
    for row in scoped_rows:
        row['baseline_median_vacancy'] = round(baseline, 6) if pd.notna(baseline) else None
        row['vacancy_lift_pp'] = round((row['median'] - baseline) * 100, 2) if pd.notna(baseline) else None

borough_values = ['All'] + sorted(v for v in t4['borough'].dropna().unique() if v != 'Unknown')
room_values = ['All'] + sorted(v for v in t4['room_type'].dropna().unique())
for borough in borough_values:
    borough_scope = t4 if borough == 'All' else t4[t4['borough'] == borough]
    for room_type in room_values:
        scope = borough_scope if room_type == 'All' else borough_scope[borough_scope['room_type'] == room_type]
        if not scope.empty:
            add_box_rows(scope, borough, room_type)

box_df = pd.DataFrame(box_rows)
box_df = box_df.sort_values(['borough', 'room_type', 'minimum_nights_group', 'price_setting_group'])
box_df.to_csv(OUT / 'task4_min_nights_vacancy_box.csv', index=False)
print(f'  Box rows: {len(box_df)}')

# ── Support candidates ──────────────────────────────────────────────────────
cand_mask = (
    (t4['minimum_nights_num'] >= SUPPORT_MIN_NIGHTS)
    & (t4['price_setting_group'] == 'High fixed price')
    & (t4['vacancy_rate'] >= SUPPORT_VACANCY_FLOOR)
)
cands = t4[cand_mask].copy()

cands['support_reason'] = (
    'Strict ' + cands['minimum_nights_num'].astype(int).astype(str)
    + '+ night minimum AND price '
    + (cands['price_gap_pct'] * 100).round(0).astype(int).astype(str)
    + '% above peer median; '
    + (cands['vacancy_rate'] * 100).round(0).astype(int).astype(str)
    + '% vacant.'
)

cands = cands.sort_values(
    ['vacancy_rate', 'price_gap_pct', 'minimum_nights_num'],
    ascending=[False, False, False],
).reset_index(drop=True)
cands['support_priority_rank'] = cands.index + 1

name_col = 'name' if 'name' in cands.columns else None
if not name_col:
    cands['name'] = 'Listing ' + cands['id'].astype(str)

export_cols = [
    'support_priority_rank',
    'id',
    'name',
    'neighbourhood_cleansed',
    'borough',
    'room_type',
    'minimum_nights_num',
    'price_clean',
    'peer_median_price',
    'price_gap_pct',
    'available_days',
    'total_days',
    'vacancy_rate',
    'support_reason',
]
cand_out = cands[export_cols].rename(columns={
    'id':                  'listing_id',
    'minimum_nights_num':  'minimum_nights',
    'price_clean':         'price',
})
cand_out['minimum_nights'] = cand_out['minimum_nights'].astype(int)
cand_out['price']             = cand_out['price'].round(2)
cand_out['peer_median_price'] = cand_out['peer_median_price'].round(2)
cand_out['price_gap_pct']     = cand_out['price_gap_pct'].round(4)
cand_out['vacancy_rate']      = cand_out['vacancy_rate'].round(4)
cand_out['available_days']    = cand_out['available_days'].astype(int)
cand_out['total_days']        = cand_out['total_days'].astype(int)
cand_out.to_csv(OUT / 'task4_support_candidates.csv', index=False)
print(f'  Support candidates: {len(cand_out):,} (top {TOP_CANDIDATES} surfaced in UI)')

print('Done.')
