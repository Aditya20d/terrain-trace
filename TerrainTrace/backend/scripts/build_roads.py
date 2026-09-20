import json
from pathlib import Path
import osmium


INPUT_FILE = Path(
    "data/roads/north-eastern-zone.osm.pbf"
)

OUTPUT_FILE = Path(
    "data/roads/northeast-roads.geojson"
)

ALLOWED_HIGHWAYS = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
}


class RoadHandler(osmium.SimpleHandler):
    def __init__(self, output_file):
        super().__init__()
        self.output_file = output_file
        self.first_feature = True
        self.count = 0

        self.output_file.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        with self.output_file.open(
            "w",
            encoding="utf-8",
        ) as file:
            file.write(
                '{"type":"FeatureCollection","features":['
            )

    def way(self, way):
        highway = way.tags.get("highway")

        if highway not in ALLOWED_HIGHWAYS:
            return

        if not way.nodes:
            return

        coordinates = []

        for node in way.nodes:
            try:
                lon = node.lon
                lat = node.lat

                if (
                    lon is None
                    or lat is None
                ):
                    return

                coordinates.append(
                    [lon, lat]
                )

            except Exception:
                return

        if len(coordinates) < 2:
            return

        properties = {
            "osm_id": way.id,
            "name": way.tags.get(
                "name"
            ),
            "ref": way.tags.get(
                "ref"
            ),
            "highway": highway,
            "surface": way.tags.get(
                "surface"
            ),
            "lanes": way.tags.get(
                "lanes"
            ),
            "maxspeed": way.tags.get(
                "maxspeed"
            ),
            "oneway": way.tags.get(
                "oneway"
            ),
        }

        feature = {
            "type": "Feature",
            "properties": properties,
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates,
            },
        }

        with self.output_file.open(
            "a",
            encoding="utf-8",
        ) as file:
            if not self.first_feature:
                file.write(",")

            file.write(
                json.dumps(
                    feature,
                    separators=(",", ":"),
                )
            )

            self.first_feature = False
            self.count += 1

            if self.count % 5000 == 0:
                print(
                    f"Processed {self.count} roads..."
                )

    def close_output(self):
        with self.output_file.open(
            "a",
            encoding="utf-8",
        ) as file:
            file.write("]}")


def main():
    if not INPUT_FILE.exists():
        raise FileNotFoundError(
            f"Input file not found: {INPUT_FILE}"
        )

    print(
        f"Reading: {INPUT_FILE}"
    )

    print(
        "Filtering highway types:",
        ", ".join(
            sorted(ALLOWED_HIGHWAYS)
        ),
    )

    handler = RoadHandler(
        OUTPUT_FILE
    )

    try:
        handler.apply_file(
            str(INPUT_FILE),
            locations=True,
            idx="flex_mem",
        )
    finally:
        handler.close_output()

    print()
    print(
        f"Road preprocessing complete."
    )

    print(
        f"Roads exported: {handler.count}"
    )

    print(
        f"Output: {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    main()