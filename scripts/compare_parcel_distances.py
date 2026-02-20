import json
import statistics as stats

import pyproj
from shapely.geometry import shape
from shapely.ops import transform
from shapely.strtree import STRtree


MILES_TO_METERS = 1609.344


def load_geoms(path: str):
    with open(path, "rb") as f:
        fc = json.load(f)
    return [shape(ft["geometry"]) for ft in fc.get("features", [])]


def main():
    proj = pyproj.Transformer.from_crs("EPSG:4326", "EPSG:32616", always_xy=True).transform

    metro_geoms = [transform(proj, g) for g in load_geoms("data/parks_boundaries_metro.geojson")]
    all_geoms = [transform(proj, g) for g in load_geoms("data/parks_boundaries_all.geojson")]

    metro_tree = STRtree(metro_geoms)
    all_tree = STRtree(all_geoms)

    with open("data/parcels.geojson", "rb") as f:
        parcels_fc = json.load(f)
    parcels = parcels_fc.get("features", [])
    n = len(parcels)
    print(f"parcel_features={n}")

    # evenly spaced sample to avoid scanning the whole file
    sample_n = 300
    idxs = [int(i * (n - 1) / (sample_n - 1)) for i in range(sample_n)]

    abs_diff_all_m = []
    abs_diff_metro_m = []
    for i in idxs:
        ft = parcels[i]
        pt = transform(proj, shape(ft["geometry"]))
        dist_m = float(ft["properties"]["dist_mi"]) * MILES_TO_METERS

        nearest_all = all_geoms[int(all_tree.nearest(pt))]
        nearest_metro = metro_geoms[int(metro_tree.nearest(pt))]
        d_all = pt.distance(nearest_all)
        d_metro = pt.distance(nearest_metro)

        abs_diff_all_m.append(abs(d_all - dist_m))
        abs_diff_metro_m.append(abs(d_metro - dist_m))

    def pctl(arr, p):
        s = sorted(arr)
        return s[int(p * (len(s) - 1))]

    print("median_abs_diff_to_all_m", stats.median(abs_diff_all_m))
    print("median_abs_diff_to_metro_m", stats.median(abs_diff_metro_m))
    print("p90_abs_diff_to_all_m", pctl(abs_diff_all_m, 0.90))
    print("p90_abs_diff_to_metro_m", pctl(abs_diff_metro_m, 0.90))


if __name__ == "__main__":
    main()

