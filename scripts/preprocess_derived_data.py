import json
import pandas as pd
from pathlib import Path

DATA = Path('public/data')
OUT = DATA / 'derived'
OUT.mkdir(parents=True, exist_ok=True)

LISTINGS = DATA / 'listings_cleaned.csv'
REVIEWS = DATA / 'reviews_cleaned.csv'
CALENDAR = DATA / 'calendar_cleaned.csv'
GEOJSON = DATA / 'neighbourhoods.geojson'

HIGH_PRICE_RATIO = 1.25
SUPPORT_MIN_NIGHTS = 30
SUPPORT_VACANCY_FLOOR = 0.80

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

print('Loading listings...')
listings = pd.read_csv(LISTINGS, low_memory=False)
listings['id'] = listings['id'].astype(str)
listings['borough'] = listings['neighbourhood_cleansed'].map(load_borough_map()).fillna('Unknown')

# Task 1
print('Task 1...')
t1 = listings.copy()
t1['price_clean'] = pd.to_numeric(t1['price'], errors='coerce')
t1['review_scores_rating'] = pd.to_numeric(t1['review_scores_rating'], errors='coerce')
valid_price = t1['price_clean'].notna() & ~bool_series(t1['price_missing']) & ~bool_series(t1['is_price_outlier'])
t1 = t1[valid_price & t1['review_scores_rating'].notna()]
rows = []
for (b, n, r), g in t1.groupby(['borough', 'neighbourhood_cleansed', 'room_type'], dropna=True):
    corr = pearson(g)
    if corr is not None and pd.notna(corr):
        rows.append({
            'borough': b,
            'neighbourhood_cleansed': n,
            'room_type': r,
            'pearson_r': corr,
            'sample_size': len(g),
            'avg_price_clean': g['price_clean'].mean(),
            'avg_review_scores_rating': g['review_scores_rating'].mean(),
        })
pd.DataFrame(rows).sort_values(['borough','neighbourhood_cleansed','room_type']).to_csv(OUT / 'task1_price_rating_corr.csv', index=False)

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

# Legacy monthly host-group meta used by task3_vacancy_month_host_group.csv
listing_meta_month = listings[['id','calculated_host_listings_count']].copy()
listing_meta_month['host_group'] = pd.to_numeric(listing_meta_month['calculated_host_listings_count'], errors='coerce').fillna(0).apply(lambda x: 'Individual host' if x == 1 else 'Multi-listing host')
month_meta = listing_meta_month.set_index('id')[['host_group']]

# Task 4 meta: single-property hosts, grouped by price rigidity.
task4_cols = [
    'id',
    'calculated_host_listings_count',
    'minimum_nights',
    'price',
    'price_missing',
    'is_price_outlier',
    'room_type',
    'neighbourhood_cleansed',
]
if 'name' in listings.columns:
    task4_cols.append('name')

task4_meta = listings[task4_cols].copy()
task4_meta['price_clean'] = pd.to_numeric(task4_meta['price'], errors='coerce')
task4_meta['minimum_nights_num'] = pd.to_numeric(task4_meta['minimum_nights'], errors='coerce')
task4_meta['host_listings_count_num'] = pd.to_numeric(task4_meta['calculated_host_listings_count'], errors='coerce')
task4_valid_price = (
    task4_meta['price_clean'].notna()
    & ~bool_series(task4_meta['price_missing'])
    & ~bool_series(task4_meta['is_price_outlier'])
)
task4_single_host = task4_meta['host_listings_count_num'] == 1
task4_meta = task4_meta[
    task4_valid_price
    & task4_single_host
    & task4_meta['minimum_nights_num'].notna()
].copy()
task4_meta['minimum_nights_group'] = task4_meta['minimum_nights_num'].apply(min_nights_group)

peer_median = task4_meta.groupby('room_type')['price_clean'].median().rename('peer_median_price')
task4_meta = task4_meta.merge(peer_median, on='room_type', how='left')
task4_meta['price_gap_pct'] = (task4_meta['price_clean'] - task4_meta['peer_median_price']) / task4_meta['peer_median_price']
task4_meta['price_setting_group'] = (
    (task4_meta['price_clean'] >= HIGH_PRICE_RATIO * task4_meta['peer_median_price'])
    .map({True: 'High fixed price', False: 'Normal/lower fixed price'})
)
task4_box_meta = task4_meta.set_index('id')[['minimum_nights_group','price_setting_group']]

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

    # --- Legacy monthly host-group aggregation ---
    chunk_month = chunk.copy()
    chunk_month['date_month'] = pd.to_datetime(chunk_month['date'], errors='coerce').dt.to_period('M').astype(str)
    chunk_month = chunk_month.join(month_meta, on='listing_id')
    chunk_month = chunk_month.dropna(subset=['host_group'])
    month_parts.append(chunk_month.groupby(['date_month','host_group','room_type'], dropna=True).agg(available_days=('available_num','sum'), total_days=('available_num','size')).reset_index())

    # --- Task 4 price-rigidity aggregation ---
    chunk_t4 = chunk[['listing_id','available_num']].copy()
    chunk_t4 = chunk_t4.join(task4_box_meta, on='listing_id')
    chunk_t4 = chunk_t4.dropna(subset=['minimum_nights_group','price_setting_group'])
    listing_parts.append(chunk_t4.groupby(['listing_id','minimum_nights_group','price_setting_group'], dropna=True).agg(available_days=('available_num','sum'), total_days=('available_num','size')).reset_index())

    # --- Task 3 daily aggregation (new) ---
    chunk_t3 = chunk[['listing_id','date','available_num','price_used','room_type']].copy()
    chunk_t3['price_used'] = pd.to_numeric(chunk_t3['price_used'], errors='coerce')
    chunk_t3 = chunk_t3.join(meta_t3, on='listing_id')
    chunk_t3 = chunk_t3.dropna(subset=['host_group'])
    t3_daily_parts.append(chunk_t3)

# --- Task 4 outputs ---
month = pd.concat(month_parts).groupby(['date_month','host_group','room_type'], as_index=False).sum()
month['vacancy_rate'] = month['available_days'] / month['total_days']
month[['date_month','host_group','room_type','vacancy_rate','available_days','total_days']].to_csv(OUT / 'task3_vacancy_month_host_group.csv', index=False)
listing_v = pd.concat(listing_parts).groupby(['listing_id','minimum_nights_group','price_setting_group'], as_index=False).sum()
listing_v['vacancy_rate'] = listing_v['available_days'] / listing_v['total_days']
box_rows, out_rows = [], []
for (mn, pg), g in listing_v.dropna(subset=['minimum_nights_group','price_setting_group']).groupby(['minimum_nights_group','price_setting_group']):
    q1, med, q3 = g['vacancy_rate'].quantile([.25,.5,.75])
    iqr = q3 - q1
    low, high = max(0, q1 - 1.5*iqr), min(1, q3 + 1.5*iqr)
    box_rows.append({'minimum_nights_group': mn, 'price_setting_group': pg, 'q1': q1, 'median': med, 'q3': q3, 'whisker_low': low, 'whisker_high': high, 'sample_size': len(g)})
    outs = g[(g['vacancy_rate'] < low) | (g['vacancy_rate'] > high)][['minimum_nights_group','price_setting_group','listing_id','vacancy_rate']]
    out_rows.append(outs)
box_df = pd.DataFrame(box_rows)
baseline_row = box_df[
    (box_df['minimum_nights_group'] == '1-2 nights')
    & (box_df['price_setting_group'] == 'Normal/lower fixed price')
]
baseline = float(baseline_row['median'].iloc[0]) if not baseline_row.empty else float('nan')
box_df['baseline_median_vacancy'] = round(baseline, 6) if pd.notna(baseline) else None
box_df['vacancy_lift_pp'] = ((box_df['median'] - baseline) * 100).round(2)
box_df.to_csv(OUT / 'task4_min_nights_vacancy_box.csv', index=False)
if out_rows:
    pd.concat(out_rows, ignore_index=True).to_csv(OUT / 'task4_min_nights_vacancy_outliers.csv', index=False)
else:
    pd.DataFrame(columns=['minimum_nights_group','price_setting_group','listing_id','vacancy_rate']).to_csv(OUT / 'task4_min_nights_vacancy_outliers.csv', index=False)

task4_detail = listing_v.merge(
    task4_meta,
    left_on='listing_id',
    right_on='id',
    how='left',
    suffixes=('', '_meta'),
)
cand_mask = (
    (task4_detail['minimum_nights_num'] >= SUPPORT_MIN_NIGHTS)
    & (task4_detail['price_setting_group'] == 'High fixed price')
    & (task4_detail['vacancy_rate'] >= SUPPORT_VACANCY_FLOOR)
)
cands = task4_detail[cand_mask].copy()
if 'name' not in cands.columns:
    cands['name'] = 'Listing ' + cands['listing_id'].astype(str)
else:
    cands['name'] = cands['name'].fillna('Listing ' + cands['listing_id'].astype(str))
cands['support_reason'] = (
    'Strict ' + cands['minimum_nights_num'].astype(int).astype(str)
    + '+ night minimum AND price '
    + (cands['price_gap_pct'] * 100).round(0).astype(int).astype(str)
    + '% above peer median; '
    + (cands['vacancy_rate'] * 100).round(0).astype(int).astype(str)
    + '% vacant.'
)
cands = cands.sort_values(
    ['vacancy_rate','price_gap_pct','minimum_nights_num'],
    ascending=[False, False, False],
).reset_index(drop=True)
cands['support_priority_rank'] = cands.index + 1
cand_cols = [
    'support_priority_rank',
    'listing_id',
    'name',
    'neighbourhood_cleansed',
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
cand_out = cands[cand_cols].rename(columns={
    'minimum_nights_num': 'minimum_nights',
    'price_clean': 'price',
})
cand_out['minimum_nights'] = cand_out['minimum_nights'].astype(int)
cand_out['price'] = cand_out['price'].round(2)
cand_out['peer_median_price'] = cand_out['peer_median_price'].round(2)
cand_out['price_gap_pct'] = cand_out['price_gap_pct'].round(4)
cand_out['vacancy_rate'] = cand_out['vacancy_rate'].round(4)
cand_out['available_days'] = cand_out['available_days'].astype(int)
cand_out['total_days'] = cand_out['total_days'].astype(int)
cand_out.to_csv(OUT / 'task4_support_candidates.csv', index=False)

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

# Task 6 — Host Benchmark Profile
print('Task 6...')

t6 = listings.copy()

# --- Coerce all required columns ---
t6['host_id'] = t6['host_id'].astype(str)
t6['host_is_superhost_bool'] = bool_series(t6['host_is_superhost'])
t6['host_acceptance_rate'] = pd.to_numeric(t6['host_acceptance_rate'], errors='coerce')
t6['host_response_rate']   = pd.to_numeric(t6['host_response_rate'],   errors='coerce')
t6['host_trust_score']     = pd.to_numeric(t6['host_trust_score'],     errors='coerce')
t6['review_scores_rating'] = pd.to_numeric(t6['review_scores_rating'], errors='coerce')
t6['number_of_reviews_ltm']= pd.to_numeric(t6['number_of_reviews_ltm'],errors='coerce')
t6['occupancy_rate_365']   = pd.to_numeric(t6['occupancy_rate_365'],   errors='coerce')
t6['host_identity_verified_bool'] = bool_series(t6['host_identity_verified']).astype(float)
t6['instant_bookable_bool']       = bool_series(t6['instant_bookable']).astype(float)
t6['cashflow_risk_flag_num']      = pd.to_numeric(t6['cashflow_risk_flag'], errors='coerce').fillna(0)

# --- Dedup rule: host with ANY superhost listing → Superhost ---
host_superhost = t6.groupby('host_id')['host_is_superhost_bool'].any()
t6['host_group'] = t6['host_id'].map(host_superhost).map({True: 'Superhost', False: 'Regular host'})

# --- Aggregate to host level (mean per host_id, then mean across hosts) ---
host_agg = t6.groupby(['host_id', 'host_group'], as_index=False).agg(
    rating          =('review_scores_rating',    'mean'),
    acceptance      =('host_acceptance_rate',    'mean'),
    response        =('host_response_rate',      'mean'),
    trust           =('host_trust_score',        'mean'),
    demand          =('number_of_reviews_ltm',   'mean'),
    occupancy       =('occupancy_rate_365',      'mean'),
    identity        =('host_identity_verified_bool', 'max'),   # verified if any listing verified
    instant         =('instant_bookable_bool',   'mean'),
    cashflow_risk   =('cashflow_risk_flag_num',  'mean'),
)
host_agg['low_risk'] = 1 - host_agg['cashflow_risk']

# --- Compute Superhost P75 for demand cap ---
sh_hosts = host_agg[host_agg['host_group'] == 'Superhost']
demand_cap = sh_hosts['demand'].quantile(0.75)
if demand_cap == 0 or pd.isna(demand_cap):
    demand_cap = host_agg['demand'].quantile(0.75)

# --- Define 9 metrics with normalization and target logic ---
# metric_id, metric_label, metric_group, raw_col, normalize_fn, target_fn
METRICS = [
    # Quality / Outcomes
    ('rating',    'Rating',           'Quality & Outcomes', 'rating',   lambda v: v / 5 * 100),
    ('trust',     'Trust score',      'Quality & Outcomes', 'trust',    lambda v: v / 3 * 100),
    ('low_risk',  'Low risk',         'Quality & Outcomes', 'low_risk', lambda v: v * 100),
    ('demand',    'Recent demand',    'Quality & Outcomes', 'demand',   lambda v: (v / demand_cap * 100).clip(0, 100)),
    ('occupancy', 'Occupancy',        'Quality & Outcomes', 'occupancy',lambda v: v * 100),
    # Operations
    ('acceptance','Acceptance rate',  'Operations',         'acceptance',lambda v: v * 100),
    ('response',  'Response rate',    'Operations',         'response', lambda v: v * 100),
    # Technical settings
    ('identity',  'Identity verified','Technical settings', 'identity', lambda v: v * 100),
    ('instant',   'Instant bookable', 'Technical settings', 'instant',  lambda v: v * 100),
]

# Target thresholds: computed from Superhost distribution
def sh_quantile(col, q):
    vals = sh_hosts[col].dropna()
    return float(vals.quantile(q)) if len(vals) else float('nan')

target_rules = {
    'rating':    ('P25', sh_quantile('rating',    0.25), lambda v: v / 5 * 100),
    'trust':     ('median', sh_quantile('trust',  0.50), lambda v: v / 3 * 100),
    'low_risk':  ('median', sh_quantile('low_risk',0.50),lambda v: v * 100),
    'demand':    ('median', sh_quantile('demand', 0.50), lambda v: min((v / demand_cap * 100), 100)),
    'occupancy': ('P25',    sh_quantile('occupancy',0.25),lambda v: v * 100),
    'acceptance':('P25',    sh_quantile('acceptance',0.25),lambda v: v * 100),
    'response':  ('P25',    sh_quantile('response',0.25), lambda v: v * 100),
    'identity':  ('100%',   1.0,                          lambda v: v * 100),
    'instant':   ('median', sh_quantile('instant', 0.50), lambda v: v * 100),
}

profile_rows = []
for metric_id, metric_label, metric_group, raw_col, norm_fn in METRICS:
    t_label, t_raw, t_norm_fn = target_rules[metric_id]
    t_score = t_norm_fn(t_raw) if not pd.isna(t_raw) else float('nan')

    for group in ['Superhost', 'Regular host']:
        g = host_agg[host_agg['host_group'] == group][raw_col].dropna()
        total_hosts = int((host_agg['host_group'] == group).sum())
        sample_size = int(len(g))
        completeness = round(sample_size / total_hosts, 4) if total_hosts else 0
        raw_mean = float(g.mean()) if sample_size else float('nan')
        norm_score = float(norm_fn(pd.Series([raw_mean])).iloc[0]) if sample_size else float('nan')
        norm_score = round(min(max(norm_score, 0), 100), 2) if not pd.isna(norm_score) else float('nan')

        # raw_unit
        if metric_id in ('rating',):
            raw_unit = 'rating'
        elif metric_id in ('trust',):
            raw_unit = 'score'
        elif metric_id in ('demand',):
            raw_unit = 'count'
        else:
            raw_unit = 'percent'

        profile_rows.append({
            'metric_id':         metric_id,
            'metric_label':      metric_label,
            'metric_group':      metric_group,
            'host_profile_group':group,
            'normalized_score':  norm_score,
            'raw_value':         round(raw_mean, 4) if not pd.isna(raw_mean) else '',
            'raw_unit':          raw_unit,
            'sample_size':       sample_size,
            'total_hosts':       total_hosts,
            'completeness_rate': completeness,
            'target_score':      round(t_score, 2) if not pd.isna(t_score) else '',
            'target_value':      round(t_raw, 4) if not pd.isna(t_raw) else '',
            'target_label':      t_label,
        })

t6_out = pd.DataFrame(profile_rows)
t6_out.to_csv(OUT / 'task6_host_profile.csv', index=False)
print(f'  Task 6 host profile: {len(t6_out)} rows (expect 18)')

# Keep legacy file so old imports don't hard-error
kpis_legacy = []
listings['host_performance_group'] = bool_series(listings['host_is_superhost']).map({True:'Superhost', False:'Regular host'})
for group, g in listings.groupby('host_performance_group'):
    metrics_legacy = {
        'avg_host_acceptance_rate': pd.to_numeric(g['host_acceptance_rate'], errors='coerce').dropna(),
        'instant_bookable_rate': bool_series(g['instant_bookable']).astype(float),
        'avg_review_scores_rating': pd.to_numeric(g['review_scores_rating'], errors='coerce').dropna(),
    }
    for name, vals in metrics_legacy.items():
        kpis_legacy.append({'kpi_name': name, 'kpi_value': vals.mean(), 'host_performance_group': group, 'sample_size': len(vals)})
pd.DataFrame(kpis_legacy).to_csv(OUT / 'task6_host_kpi.csv', index=False)
print('Done:', OUT)
