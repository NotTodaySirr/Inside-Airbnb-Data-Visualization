"""
Enriches listings_cleaned.csv with the `name` column from raw listings.csv.

Steps:
  1. Read id + name from .KB/rawdata/listings.csv
  2. Left-join into listings_cleaned.csv on id
  3. Insert name immediately after id
  4. Write to .KB/progress/listings_cleaned_with_name.csv for validation
  5. If validation passes, backup original and replace public/data/listings_cleaned.csv
"""

import pandas as pd
from pathlib import Path
import shutil

RAW      = Path('.KB/rawdata/listings.csv')
CLEANED  = Path('public/data/listings_cleaned.csv')
PROGRESS = Path('.KB/progress/listings_cleaned_with_name.csv')
BACKUP   = Path('public/data/listings_cleaned.backup.csv')

# ── 1. Load raw name map ──────────────────────────────────────────
print('Reading raw listings...')
raw = pd.read_csv(RAW, usecols=['id', 'name'], low_memory=False)
raw['id'] = raw['id'].astype(str).str.strip()
raw = raw.drop_duplicates(subset='id')
print(f'  Raw rows: {len(raw)}, unique ids: {raw["id"].nunique()}')

# ── 2. Load cleaned listings ──────────────────────────────────────
print('Reading cleaned listings...')
cleaned = pd.read_csv(CLEANED, low_memory=False)
cleaned['id'] = cleaned['id'].astype(str).str.strip()
original_cols = cleaned.columns.tolist()
original_rows = len(cleaned)
print(f'  Cleaned rows: {original_rows}, columns: {len(original_cols)}')

# Guard: skip if name already exists
if 'name' in cleaned.columns:
    print('  `name` column already present — nothing to do.')
    exit(0)

# ── 3. Left-join name ─────────────────────────────────────────────
print('Joining name...')
enriched = cleaned.merge(raw[['id', 'name']], on='id', how='left')

# Insert name immediately after id
cols = enriched.columns.tolist()
cols.remove('name')
id_pos = cols.index('id')
cols.insert(id_pos + 1, 'name')
enriched = enriched[cols]

# ── 4. Validate ───────────────────────────────────────────────────
print('Validating...')
assert len(enriched) == original_rows, \
    f'Row count changed: {original_rows} → {len(enriched)}'
assert 'name' in enriched.columns, 'name column missing after join'
assert enriched['id'].nunique() == cleaned['id'].nunique(), \
    'Duplicate ids introduced'

null_names = enriched['name'].isna().sum()
blank_names = (enriched['name'].astype(str).str.strip() == '').sum()
print(f'  Rows: {len(enriched)} OK')
print(f'  Null names: {null_names}')
print(f'  Blank names: {blank_names}')

# Confirm no existing column values changed (spot-check price, room_type)
for col in ['neighbourhood_cleansed', 'room_type', 'price']:
    if col in cleaned.columns:
        orig_vals = cleaned[col].reset_index(drop=True)
        new_vals  = enriched[col].reset_index(drop=True)
        assert orig_vals.equals(new_vals), f'Column {col} values changed!'
print('  Existing column values unchanged OK')

# ── 5. Write to progress dir first ───────────────────────────────
PROGRESS.parent.mkdir(parents=True, exist_ok=True)
enriched.to_csv(PROGRESS, index=False)
print(f'  Written to {PROGRESS}')

# ── 6. Backup + replace cleaned file ─────────────────────────────
print('Backing up original cleaned file...')
shutil.copy2(CLEANED, BACKUP)
print(f'  Backup saved to {BACKUP}')

print('Replacing listings_cleaned.csv...')
enriched.to_csv(CLEANED, index=False)
print(f'  Done. listings_cleaned.csv now has {len(enriched.columns)} columns.')
print(f'  New column order (first 5): {enriched.columns[:5].tolist()}')
print('All done.')
