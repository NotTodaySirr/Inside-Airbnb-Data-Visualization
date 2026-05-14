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

# Task 2
print('Task 2...')
reviews = pd.read_csv(REVIEWS, usecols=['date','room_type'], low_memory=False)
reviews['review_month'] = pd.to_datetime(reviews['date'], errors='coerce').dt.to_period('M').astype(str)
t2 = reviews.dropna(subset=['review_month','room_type']).groupby(['review_month','room_type']).size().reset_index(name='review_count')
t2.to_csv(OUT / 'task2_review_month_room_type.csv', index=False)

# Tasks 3/4 calendar aggregation in chunks
print('Tasks 3/4 calendar chunks...')
listing_meta = listings[['id','calculated_host_listings_count','minimum_nights']].copy()
listing_meta['host_group'] = pd.to_numeric(listing_meta['calculated_host_listings_count'], errors='coerce').fillna(0).apply(lambda x: 'Individual host' if x == 1 else 'Multi-listing host')
listing_meta['minimum_nights_group'] = pd.to_numeric(listing_meta['minimum_nights'], errors='coerce').apply(min_nights_group)
meta = listing_meta.set_index('id')[['host_group','minimum_nights_group']]
month_parts = []
listing_parts = []
for chunk in pd.read_csv(CALENDAR, usecols=['listing_id','date','available','room_type'], chunksize=1_000_000, low_memory=False):
    chunk['listing_id'] = chunk['listing_id'].astype(str)
    chunk['date_month'] = pd.to_datetime(chunk['date'], errors='coerce').dt.to_period('M').astype(str)
    chunk['available_num'] = bool_series(chunk['available']).astype(int)
    chunk = chunk.join(meta, on='listing_id')
    chunk = chunk.dropna(subset=['host_group'])
    month_parts.append(chunk.groupby(['date_month','host_group','room_type'], dropna=True).agg(available_days=('available_num','sum'), total_days=('available_num','size')).reset_index())
    listing_parts.append(chunk.groupby(['listing_id','host_group','minimum_nights_group'], dropna=True).agg(available_days=('available_num','sum'), total_days=('available_num','size')).reset_index())
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

# Task 5 — Neighbourhood Opportunity Heatmap
print('Task 5...')

# --- 5a. Listing-level base metrics ---
t5_listings = listings[['id', 'neighbourhood_cleansed', 'room_type', 'price',
                         'number_of_reviews_ltm', 'calculated_host_listings_count']].copy()
t5_listings['id'] = t5_listings['id'].astype(str)
t5_listings['price_clean'] = pd.to_numeric(t5_listings['price'], errors='coerce')
t5_listings['reviews_ltm'] = pd.to_numeric(t5_listings['number_of_reviews_ltm'], errors='coerce').fillna(0)
t5_listings['host_count'] = pd.to_numeric(t5_listings['calculated_host_listings_count'], errors='coerce').fillna(1)
t5_listings['host_group'] = t5_listings['host_count'].apply(lambda x: 'Commercial host' if x > 1 else 'Individual host')

# --- 5b. Derive borough from GeoJSON properties ---
import json
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
t5_listings['borough'] = t5_listings['neighbourhood_cleansed'].map(borough_map).fillna('Unknown')

# --- 5c. Availability from calendar (365-day window, chunked) ---
print('  Task 5 – reading calendar for availability...')
avail_parts = []
for chunk in pd.read_csv(CALENDAR, usecols=['listing_id', 'available'], chunksize=1_000_000, low_memory=False):
    chunk['listing_id'] = chunk['listing_id'].astype(str)
    chunk['avail_num'] = bool_series(chunk['available']).astype(int)
    avail_parts.append(chunk.groupby('listing_id').agg(
        avail_days=('avail_num', 'sum'),
        total_days=('avail_num', 'size')
    ))
avail_df = pd.concat(avail_parts).groupby('listing_id').sum()
avail_df['availability_pct'] = avail_df['avail_days'] / avail_df['total_days'].clip(lower=1)
t5_listings = t5_listings.join(avail_df[['availability_pct']], on='id')
t5_listings['availability_pct'] = t5_listings['availability_pct'].fillna(0)

# --- 5c. Aggregate to neighbourhood level ---
def dominant(s):
    return s.value_counts().idxmax() if len(s) else 'Unknown'

t5_agg = t5_listings.groupby('neighbourhood_cleansed', dropna=True).agg(
    borough=('borough', dominant),
    listing_count=('id', 'count'),
    avg_price=('price_clean', 'mean'),
    avg_reviews_ltm=('reviews_ltm', 'mean'),
    total_reviews=('reviews_ltm', 'sum'),
    avg_availability_pct=('availability_pct', 'mean'),
    dominant_room_type=('room_type', dominant),
).reset_index()

t5_agg['avg_price'] = t5_agg['avg_price'].fillna(0)

# --- 5d. Normalize components to [0, 1] ---
def norm(s):
    mn, mx = s.min(), s.max()
    return (s - mn) / (mx - mn) if mx > mn else pd.Series(0.0, index=s.index)

t5_agg['norm_demand']       = norm(t5_agg['avg_reviews_ltm'])
t5_agg['norm_price']        = norm(t5_agg['avg_price'])
t5_agg['norm_availability'] = norm(t5_agg['avg_availability_pct'])
t5_agg['norm_competition']  = norm(t5_agg['listing_count'])

# --- 5e. Opportunity score ---
t5_agg['opportunity_score'] = (
    t5_agg['norm_demand'] +
    t5_agg['norm_price'] +
    t5_agg['norm_availability'] -
    t5_agg['norm_competition']
).round(4)

# Drop helper columns
t5_agg = t5_agg.drop(columns=['norm_demand', 'norm_price', 'norm_availability', 'norm_competition'])

# Round floats for readability
t5_agg['avg_price'] = t5_agg['avg_price'].round(2)
t5_agg['avg_reviews_ltm'] = t5_agg['avg_reviews_ltm'].round(2)
t5_agg['avg_availability_pct'] = (t5_agg['avg_availability_pct'] * 100).round(2)  # store as %

t5_agg.sort_values('opportunity_score', ascending=False).to_csv(
    OUT / 'task5_neighbourhood_opportunity.csv', index=False
)
print(f'  Task 5 done: {len(t5_agg)} neighbourhoods written.')

# Keep legacy files so existing imports don't break
t5_legacy = listings[['id', 'number_of_reviews_ltm', 'host_is_superhost', 'neighbourhood_cleansed']].copy()
t5_legacy['id'] = t5_legacy['id'].astype(str)
t5_legacy['number_of_reviews_ltm'] = pd.to_numeric(t5_legacy['number_of_reviews_ltm'], errors='coerce').fillna(0)
t5_legacy['host_is_superhost_bool'] = bool_series(t5_legacy['host_is_superhost'])
for c in ['latitude', 'longitude']:
    if c in listings.columns:
        t5_legacy[c] = listings[c]
    else:
        t5_legacy[c] = None
threshold = t5_legacy['number_of_reviews_ltm'].quantile(.9)
t5_legacy['is_top_tier'] = t5_legacy['number_of_reviews_ltm'] >= threshold
t5_top = t5_legacy[t5_legacy['is_top_tier']].rename(columns={'id': 'listing_id'})
t5_top[['listing_id', 'latitude', 'longitude', 'number_of_reviews_ltm', 'host_is_superhost', 'neighbourhood_cleansed']].to_csv(OUT / 'task5_top_tier_locations.csv', index=False)
gap_rows = []
for neighbourhood, group in t5_legacy.groupby('neighbourhood_cleansed', dropna=True):
    top_tier = group[group['is_top_tier']]
    superhost_count = int(top_tier['host_is_superhost_bool'].sum())
    total_top_tier = int(len(top_tier))
    regular_count = int(total_top_tier - superhost_count)
    superhost_share = superhost_count / total_top_tier if total_top_tier else 0
    gap_score = regular_count * (1 - superhost_share) if total_top_tier else 0
    gap_rows.append({
        'neighbourhood_cleansed': neighbourhood,
        'total_listings': int(len(group)),
        'top_tier_threshold_ltm': threshold,
        'total_top_tier_listings': total_top_tier,
        'top_tier_superhost_count': superhost_count,
        'top_tier_regular_count': regular_count,
        'superhost_share': superhost_share,
        'gap_score': gap_score,
        'avg_top_tier_reviews_ltm': top_tier['number_of_reviews_ltm'].mean() if total_top_tier else 0,
    })
pd.DataFrame(gap_rows).sort_values(['gap_score', 'top_tier_regular_count'], ascending=[False, False]).to_csv(OUT / 'task5_neighbourhood_gap.csv', index=False)

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
