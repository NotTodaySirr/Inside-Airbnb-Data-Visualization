import pandas as pd
from pathlib import Path

DATA = Path('public/data')
OUT = DATA / 'derived'
OUT.mkdir(parents=True, exist_ok=True)

LISTINGS = DATA / 'listings_cleaned.csv'
REVIEWS = DATA / 'reviews_cleaned.csv'
CALENDAR = DATA / 'calendar_cleaned.csv'

def bool_series(s):
    return s.astype(str).str.lower().isin(['true', 't', '1', 'yes'])

def min_nights_group(v):
    if pd.isna(v): return None
    v = float(v)
    if v <= 2: return '1-2 nights'
    if v <= 6: return '3-6 nights'
    if v <= 29: return '7-29 nights'
    return '30+ nights'

def pearson(x):
    if len(x) < 10 or x['price_clean'].nunique() < 2 or x['review_scores_rating'].nunique() < 2:
        return None
    return x['price_clean'].corr(x['review_scores_rating'])

print('Loading listings...')
listings = pd.read_csv(LISTINGS, low_memory=False)
listings['id'] = listings['id'].astype(str)

# Task 1
print('Task 1...')
t1 = listings.copy()
t1['price_clean'] = pd.to_numeric(t1['price'], errors='coerce')
t1['review_scores_rating'] = pd.to_numeric(t1['review_scores_rating'], errors='coerce')
valid_price = t1['price_clean'].notna() & ~bool_series(t1['price_missing']) & ~bool_series(t1['is_price_outlier'])
t1 = t1[valid_price & t1['review_scores_rating'].notna()]
rows = []
for (n, r), g in t1.groupby(['neighbourhood_cleansed', 'room_type'], dropna=True):
    corr = pearson(g)
    if corr is not None and pd.notna(corr):
        rows.append({
            'neighbourhood_cleansed': n,
            'room_type': r,
            'pearson_r': corr,
            'sample_size': len(g),
            'avg_price_clean': g['price_clean'].mean(),
            'avg_review_scores_rating': g['review_scores_rating'].mean(),
        })
pd.DataFrame(rows).sort_values(['neighbourhood_cleansed','room_type']).to_csv(OUT / 'task1_price_rating_corr.csv', index=False)

# Task 2 — Seasonality + Listing Promotion
print('Task 2...')
reviews2 = pd.read_csv(REVIEWS, usecols=['listing_id', 'date', 'room_type'], low_memory=False)
reviews2['listing_id'] = reviews2['listing_id'].astype(str)
reviews2['_dt'] = pd.to_datetime(reviews2['date'], errors='coerce')
reviews2 = reviews2.dropna(subset=['_dt', 'room_type'])
reviews2['review_year'] = reviews2['_dt'].dt.year.astype(int)
reviews2['month_num'] = reviews2['_dt'].dt.month.astype(int)
MONTH_LABELS = {1:'Jan',2:'Feb',3:'Mar',4:'Apr',5:'May',6:'Jun',
                7:'Jul',8:'Aug',9:'Sep',10:'Oct',11:'Nov',12:'Dec'}
reviews2['month_label'] = reviews2['month_num'].map(MONTH_LABELS)

# --- File 1: bar summary (year x month x room_type) ---
t2_bar = (
    reviews2
    .groupby(['review_year', 'month_num', 'month_label', 'room_type'], dropna=True)
    .size()
    .reset_index(name='review_count')
    .sort_values(['review_year', 'month_num'])
)
t2_bar.to_csv(OUT / 'task2_bar_summary.csv', index=False)
print(f'  Task 2 bar summary: {len(t2_bar)} rows')

# --- File 2: listing-level detail, top 20 per (year, month) ---
# Join reviews with listings to get neighbourhood, price, rating
# Include name if available (added by add_listing_name_to_cleaned.py)
_meta_cols = ['id', 'neighbourhood_cleansed', 'price', 'review_scores_rating', 'number_of_reviews_ltm']
if 'name' in listings.columns:
    _meta_cols = ['id', 'name', 'neighbourhood_cleansed', 'price', 'review_scores_rating', 'number_of_reviews_ltm']
listings_meta = listings[_meta_cols].copy()
listings_meta['id'] = listings_meta['id'].astype(str)

t2_detail_raw = (
    reviews2
    .groupby(['review_year', 'month_num', 'month_label', 'listing_id', 'room_type'], dropna=True)
    .size()
    .reset_index(name='review_count')
)
t2_detail_raw = t2_detail_raw.merge(
    listings_meta,
    left_on='listing_id',
    right_on='id',
    how='left'
).drop(columns=['id'])

# Fallback: fill missing name with 'Listing {listing_id}'
if 'name' in t2_detail_raw.columns:
    t2_detail_raw['name'] = t2_detail_raw['name'].fillna(
        'Listing ' + t2_detail_raw['listing_id'].astype(str)
    )
else:
    t2_detail_raw['name'] = 'Listing ' + t2_detail_raw['listing_id'].astype(str)

# Keep top 20 listings per (review_year, month_num) by review_count
# Tie-break: higher review_scores_rating, then higher number_of_reviews_ltm
t2_detail_raw['review_scores_rating'] = pd.to_numeric(t2_detail_raw['review_scores_rating'], errors='coerce')
t2_detail_raw['number_of_reviews_ltm'] = pd.to_numeric(t2_detail_raw['number_of_reviews_ltm'], errors='coerce').fillna(0)
t2_detail_raw['price'] = pd.to_numeric(t2_detail_raw['price'], errors='coerce')
t2_detail = (
    t2_detail_raw
    .sort_values(
        ['review_year', 'month_num', 'review_count', 'review_scores_rating', 'number_of_reviews_ltm'],
        ascending=[True, True, False, False, False]
    )
    .groupby(['review_year', 'month_num'], group_keys=False)
    .head(20)
    .sort_values(['review_year', 'month_num', 'review_count'], ascending=[True, True, False])
)
t2_detail['review_scores_rating'] = t2_detail['review_scores_rating'].round(2)
t2_detail['price'] = t2_detail['price'].round(2)

# Reorder columns to match plan schema
_detail_cols = ['review_year', 'month_num', 'month_label', 'listing_id', 'name',
                'room_type', 'neighbourhood_cleansed', 'review_count',
                'review_scores_rating', 'price', 'number_of_reviews_ltm']
_detail_cols = [c for c in _detail_cols if c in t2_detail.columns]
t2_detail = t2_detail[_detail_cols]
t2_detail.to_csv(OUT / 'task2_listing_detail.csv', index=False)
print(f'  Task 2 listing detail: {len(t2_detail)} rows')

# Keep legacy file so existing imports don't break
t2_legacy = reviews2.groupby(
    [reviews2['_dt'].dt.to_period('M').astype(str).rename('review_month'), 'room_type'],
    dropna=True
).size().reset_index(name='review_count')
t2_legacy.to_csv(OUT / 'task2_review_month_room_type.csv', index=False)

# Tasks 3/4 calendar aggregation in chunks
print('Tasks 3/4 calendar chunks...')

# Task 4 meta: keep 'Multi-listing host' label so Task4VacancyBoxPlot is unaffected
listing_meta = listings[['id','calculated_host_listings_count','minimum_nights']].copy()
listing_meta['host_group'] = pd.to_numeric(listing_meta['calculated_host_listings_count'], errors='coerce').fillna(0).apply(lambda x: 'Individual host' if x == 1 else 'Multi-listing host')
listing_meta['minimum_nights_group'] = pd.to_numeric(listing_meta['minimum_nights'], errors='coerce').apply(min_nights_group)
meta = listing_meta.set_index('id')[['host_group','minimum_nights_group']]

# Task 3 meta: use 'Commercial host' label as specified in the refactor plan
listing_meta_t3 = listings[['id','calculated_host_listings_count']].copy()
listing_meta_t3['host_group'] = pd.to_numeric(listing_meta_t3['calculated_host_listings_count'], errors='coerce').fillna(0).apply(lambda x: 'Individual host' if x == 1 else 'Commercial host')
meta_t3 = listing_meta_t3.set_index('id')[['host_group']]

month_parts = []
listing_parts = []
t3_daily_parts = []

for chunk in pd.read_csv(CALENDAR, usecols=['listing_id','date','available','price_used','room_type'], chunksize=1_000_000, low_memory=False):
    chunk['listing_id'] = chunk['listing_id'].astype(str)
    chunk['available_num'] = bool_series(chunk['available']).astype(int)

    # --- Task 4 aggregation (unchanged logic) ---
    chunk_t4 = chunk.copy()
    chunk_t4['date_month'] = pd.to_datetime(chunk_t4['date'], errors='coerce').dt.to_period('M').astype(str)
    chunk_t4 = chunk_t4.join(meta, on='listing_id')
    chunk_t4 = chunk_t4.dropna(subset=['host_group'])
    month_parts.append(chunk_t4.groupby(['date_month','host_group','room_type'], dropna=True).agg(available_days=('available_num','sum'), total_days=('available_num','size')).reset_index())
    listing_parts.append(chunk_t4.groupby(['listing_id','host_group','minimum_nights_group'], dropna=True).agg(available_days=('available_num','sum'), total_days=('available_num','size')).reset_index())

    # --- Task 3 daily aggregation (new) ---
    chunk_t3 = chunk[['listing_id','date','available_num','price_used','room_type']].copy()
    chunk_t3['price_used'] = pd.to_numeric(chunk_t3['price_used'], errors='coerce')
    chunk_t3 = chunk_t3.join(meta_t3, on='listing_id')
    chunk_t3 = chunk_t3.dropna(subset=['host_group'])
    t3_daily_parts.append(chunk_t3)

# --- Task 4 outputs (unchanged) ---
month = pd.concat(month_parts).groupby(['date_month','host_group','room_type'], as_index=False).sum()
month['vacancy_rate'] = month['available_days'] / month['total_days']
month[['date_month','host_group','room_type','vacancy_rate','available_days','total_days']].to_csv(OUT / 'task3_vacancy_month_host_group.csv', index=False)
listing_v = pd.concat(listing_parts).groupby(['listing_id','host_group','minimum_nights_group'], as_index=False).sum()
listing_v['vacancy_rate'] = listing_v['available_days'] / listing_v['total_days']
box_rows, out_rows = [], []
for (mn, hg), g in listing_v.dropna(subset=['minimum_nights_group']).groupby(['minimum_nights_group','host_group']):
    q1, med, q3 = g['vacancy_rate'].quantile([.25,.5,.75])
    iqr = q3 - q1
    low, high = max(0, q1 - 1.5*iqr), min(1, q3 + 1.5*iqr)
    box_rows.append({'minimum_nights_group': mn, 'host_group': hg, 'q1': q1, 'median': med, 'q3': q3, 'whisker_low': low, 'whisker_high': high, 'sample_size': len(g)})
    outs = g[(g['vacancy_rate'] < low) | (g['vacancy_rate'] > high)][['minimum_nights_group','host_group','listing_id','vacancy_rate']]
    out_rows.append(outs)
pd.DataFrame(box_rows).to_csv(OUT / 'task4_min_nights_vacancy_box.csv', index=False)
pd.concat(out_rows, ignore_index=True).to_csv(OUT / 'task4_min_nights_vacancy_outliers.csv', index=False)

# --- Task 3 new outputs ---
print('Task 3 daily aggregation...')
t3_full = pd.concat(t3_daily_parts, ignore_index=True)

# Restrict to first 365 calendar dates
all_dates_sorted = sorted(t3_full['date'].dropna().unique())
horizon_dates = set(all_dates_sorted[:365])
t3_365 = t3_full[t3_full['date'].isin(horizon_dates)].copy()

# File 1: daily host-group summary
grp_cols = ['date', 'host_group', 'room_type']
t3_summary_base = t3_365.groupby(grp_cols, dropna=True).agg(
    total_listing_days=('available_num', 'size'),
    available_days=('available_num', 'sum'),
).reset_index()
t3_summary_base['unavailable_days'] = t3_summary_base['total_listing_days'] - t3_summary_base['available_days']
t3_summary_base['availability_rate'] = (t3_summary_base['available_days'] / t3_summary_base['total_listing_days']).round(6)
t3_summary_base['estimated_occupancy_rate'] = (1 - t3_summary_base['availability_rate']).round(6)

# Price stats from non-null price_used only
t3_price = t3_365.dropna(subset=['price_used']).groupby(grp_cols, dropna=True).agg(
    avg_price_used=('price_used', 'mean'),
    median_price_used=('price_used', 'median'),
    price_sample_size=('price_used', 'count'),
).reset_index()
t3_price['avg_price_used'] = t3_price['avg_price_used'].round(2)
t3_price['median_price_used'] = t3_price['median_price_used'].round(2)

t3_summary = t3_summary_base.merge(t3_price, on=grp_cols, how='left')
t3_summary['price_sample_size'] = t3_summary['price_sample_size'].fillna(0).astype(int)
t3_summary = t3_summary.sort_values(['date', 'host_group', 'room_type'])
t3_summary.to_csv(OUT / 'task3_daily_host_group_summary.csv', index=False)
print(f'  Task 3 daily summary: {len(t3_summary)} rows, {t3_summary["date"].nunique()} dates')

# File 2: listing-level intervention candidates (non-Monitor rows only for browser perf)
t3_cands = t3_365.merge(
    t3_summary[grp_cols + ['median_price_used']].rename(columns={'median_price_used': 'group_median_price'}),
    on=grp_cols,
    how='left'
)
t3_cands['price_gap_pct'] = (
    (t3_cands['price_used'] - t3_cands['group_median_price'])
    / t3_cands['group_median_price'].replace(0, float('nan'))
).round(4)

THRESHOLD = 0.10

def pricing_signal(row):
    avail = bool(row['available_num'])
    gap = row['price_gap_pct']
    if pd.isna(gap):
        return 'Monitor'
    if avail and gap > THRESHOLD:
        return 'Consider discount'
    if not avail and gap < -THRESHOLD:
        return 'Consider increase'
    return 'Monitor'

t3_cands['pricing_signal'] = t3_cands.apply(pricing_signal, axis=1)
t3_cands['available'] = t3_cands['available_num'].astype(bool)

# Cap to top 20 per (date, host_group, room_type) by absolute price_gap_pct
# This keeps the file browser-safe (tens of thousands of rows, not millions)
t3_actionable = t3_cands[t3_cands['pricing_signal'] != 'Monitor'].copy()
t3_actionable = t3_actionable[[
    'date', 'listing_id', 'host_group', 'room_type',
    'available', 'price_used', 'group_median_price', 'price_gap_pct', 'pricing_signal'
]].copy()
t3_actionable['abs_gap'] = t3_actionable['price_gap_pct'].abs()
t3_actionable = (
    t3_actionable
    .sort_values(['date', 'host_group', 'room_type', 'pricing_signal', 'abs_gap'],
                 ascending=[True, True, True, True, False])
    .groupby(['date', 'host_group', 'room_type'], group_keys=False)
    .head(20)
    .drop(columns=['abs_gap'])
    .sort_values(['date', 'pricing_signal', 'price_gap_pct'], ascending=[True, True, True])
)
t3_actionable.to_csv(OUT / 'task3_intervention_candidates.csv', index=False)
print(f'  Task 3 intervention candidates: {len(t3_actionable)} rows (capped top-20 per group/date)')

# Task 5 — Superhost Spatial Density Heatmap
print('Task 5...')
import json

# --- 5a. Derive borough from GeoJSON properties ---
geo_path = DATA / 'neighbourhoods.geojson'
with open(geo_path, encoding='utf-8') as f:
    geo = json.load(f)
borough_map = {}
for feat in geo.get('features', []):
    props = feat.get('properties', {})
    n = props.get('neighbourhood') or props.get('neighbourhood_cleansed') or ''
    g = props.get('neighbourhood_group') or props.get('neighbourhood_group_cleansed') or 'Unknown'
    if n:
        borough_map[n] = g

# --- 5b. Filter to active listings only ---
t5 = listings.copy()
t5['is_active'] = bool_series(t5['is_active_listing'])
t5 = t5[t5['is_active']].copy()
print(f'  Task 5 – active listings: {len(t5)}')

# --- 5c. Coerce required columns ---
t5['listing_id'] = t5['id'].astype(str)
t5['latitude'] = pd.to_numeric(t5['latitude'], errors='coerce')
t5['longitude'] = pd.to_numeric(t5['longitude'], errors='coerce')
t5['number_of_reviews_ltm'] = pd.to_numeric(t5['number_of_reviews_ltm'], errors='coerce').fillna(0)
t5['review_scores_rating'] = pd.to_numeric(t5['review_scores_rating'], errors='coerce')
t5['price'] = pd.to_numeric(t5['price'], errors='coerce')
t5['host_is_superhost_bool'] = bool_series(t5['host_is_superhost'])
t5['host_group'] = t5['host_is_superhost_bool'].map({True: 'Superhost', False: 'Regular host'})
t5['borough'] = t5['neighbourhood_cleansed'].map(borough_map).fillna('Unknown')

# Include name if available
name_col = 'name' if 'name' in t5.columns else None

# --- 5d. Drop rows missing spatial or key fields ---
t5 = t5.dropna(subset=['latitude', 'longitude', 'number_of_reviews_ltm'])
print(f'  Task 5 – after dropping missing lat/lng/reviews: {len(t5)}')

# --- 5e. Select and export columns ---
export_cols = ['listing_id', 'latitude', 'longitude', 'neighbourhood_cleansed',
               'borough', 'room_type', 'price', 'review_scores_rating',
               'number_of_reviews_ltm', 'host_is_superhost_bool', 'host_group']
if name_col:
    export_cols = ['listing_id', 'name', 'latitude', 'longitude', 'neighbourhood_cleansed',
                   'borough', 'room_type', 'price', 'review_scores_rating',
                   'number_of_reviews_ltm', 'host_is_superhost_bool', 'host_group']

t5_out = t5[export_cols].copy()
t5_out = t5_out.rename(columns={'host_is_superhost_bool': 'host_is_superhost'})
# d3.autoType only parses lowercase "true"/"false" as booleans
t5_out['host_is_superhost'] = t5_out['host_is_superhost'].map({True: 'true', False: 'false'})
t5_out['price'] = t5_out['price'].round(2)
t5_out['review_scores_rating'] = t5_out['review_scores_rating'].round(2)
t5_out['latitude'] = t5_out['latitude'].round(6)
t5_out['longitude'] = t5_out['longitude'].round(6)

t5_out.to_csv(OUT / 'task5_spatial_listings.csv', index=False)

# Sanity check: 90th-percentile threshold and Superhost/candidate split
_threshold_90 = t5_out['number_of_reviews_ltm'].quantile(0.9)
_top_tier = t5_out[t5_out['number_of_reviews_ltm'] >= _threshold_90]
_sh_count = int((_top_tier['host_is_superhost'] == True).sum())
_cand_count = int((_top_tier['host_is_superhost'] == False).sum())
print(f'  Task 5 done: {len(t5_out)} active listings written.')
print(f'  90th-pct threshold: {_threshold_90:.0f} reviews LTM -> {len(_top_tier)} top-tier ({_sh_count} Superhosts, {_cand_count} candidates)')

# Task 6
print('Task 6...')
kpis = []
listings['host_performance_group'] = bool_series(listings['host_is_superhost']).map({True:'Superhost', False:'Regular host'})
for group, g in listings.groupby('host_performance_group'):
    metrics = {
        'avg_host_acceptance_rate': pd.to_numeric(g['host_acceptance_rate'], errors='coerce').dropna(),
        'instant_bookable_rate': bool_series(g['instant_bookable']).astype(float),
        'avg_review_scores_rating': pd.to_numeric(g['review_scores_rating'], errors='coerce').dropna(),
    }
    for name, vals in metrics.items():
        kpis.append({'kpi_name': name, 'kpi_value': vals.mean(), 'host_performance_group': group, 'sample_size': len(vals)})
pd.DataFrame(kpis).to_csv(OUT / 'task6_host_kpi.csv', index=False)
print('Done:', OUT)
