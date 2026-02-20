import json
from pathlib import Path

import pyproj
from shapely.geometry import shape
from shapely.ops import transform
from shapely.strtree import STRtree


MILES_TO_METERS = 1609.344


def band_for_miles(mi: float) -> str:
    if mi <= 0.1:
        return "0-0.1"
    if mi <= 0.25:
        return "0.1-0.25"
    if mi <= 0.75:
        return "0.25-0.75"
    if mi <= 1.5:
        return "0.75-1.5"
    if mi <= 3.0:
        return "1.5-3"
    return ">3"


def main():
    out_path = Path("data/parcels_metro.geojson")

    with open("data/parks_boundaries_metro.geojson", "rb") as f:
        metro_fc = json.load(f)
    metro_geoms_ll = [shape(ft["geometry"]) for ft in metro_fc.get("features", [])]
    if not metro_geoms_ll:
        raise SystemExit("No metro park boundaries found.")

    proj = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:32616", always_xy=True).transform
    metro_geoms = [transform(proj, g) for g in metro_geoms_ll]
    metro_tree = STRtree(metro_geoms)

    with open("data/parcels.geojson", "rb") as f:
        parcels_fc = json.load(f)

    feats = parcels_fc.get("features", [])
    total = len(feats)
    print(f"Updating {total} parcel features...")

    for i, ft in enumerate(feats, 1):
        pt = transform(proj, shape(ft["geometry"]))
        nearest = metro_geoms[int(metro_tree.nearest(pt))]
        dist_m = pt.distance(nearest)
        dist_mi = dist_m / MILES_TO_METERS
        props = ft.get("properties") or {}
        props["dist_mi"] = dist_mi
        props["band"] = band_for_miles(dist_mi)
        ft["properties"] = props

        if i % 20000 == 0:
            print(f"  processed {i}/{total}")

    parcels_fc["features"] = feats

    tmp = out_path.with_suffix(".geojson.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(parcels_fc, f, ensure_ascii=False, separators=(",", ":"))
    tmp.replace(out_path)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()

