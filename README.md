# Butler County Parks Economic Impact Dashboard

Interactive map dashboard for the [Butler County Parks Economic Impact Report](https://github.com/lucas-ms1/Butler-Co-Parks-Economic-Impact-Report).

**Live site:** [GitHub Pages](https://lucas-ms1.github.io/Economic-Impact-Report-Dashboard/)

## Features

- Parcel distance bands to parks (MetroParks and all parks)
- Residential-only filter
- Census tracts, townships, school districts
- MapLibre GL + PMTiles

## Data

Data is exported from the main report repo. To regenerate: run `export_dashboard_assets.py` and `build_parcels_pmtiles.sh` in the main repo, then copy outputs to `data/`.
