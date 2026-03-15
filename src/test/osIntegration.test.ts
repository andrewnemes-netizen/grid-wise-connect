import { describe, it, expect } from "vitest";

const OS_API_KEY = "j7vwIPqoPOj5tiwNsJGlQ1SDD2GpsehD";

describe("OS Data Hub API Integration", () => {
  describe("OS Names API", () => {
    it("returns results for a place name search", async () => {
      const res = await fetch(
        `https://api.os.uk/search/names/v1/find?query=Manchester&maxresults=3&key=${OS_API_KEY}`
      );
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.results).toBeDefined();
      expect(data.results.length).toBeGreaterThan(0);
      const entry = data.results[0].GAZETTEER_ENTRY;
      expect(entry.NAME1).toBeDefined();
      expect(entry.GEOMETRY_X).toBeGreaterThan(0);
      expect(entry.GEOMETRY_Y).toBeGreaterThan(0);
    });

    it("returns results for a postcode search", async () => {
      const res = await fetch(
        `https://api.os.uk/search/names/v1/find?query=SW1A+1AA&maxresults=3&key=${OS_API_KEY}`
      );
      expect(res.ok).toBe(true);
      const data = await res.json();
      expect(data.results).toBeDefined();
    });
  });

  describe("OS Maps Raster API", () => {
    it("returns a valid tile for OS Road basemap", async () => {
      const res = await fetch(
        `https://api.os.uk/maps/raster/v1/zxy/Road_3857/10/511/340.png?key=${OS_API_KEY}`
      );
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("image");
    });

    it("returns a valid tile for OS Outdoor basemap", async () => {
      const res = await fetch(
        `https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/10/511/340.png?key=${OS_API_KEY}`
      );
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("image");
    });

    it("returns a valid tile for OS Light basemap", async () => {
      const res = await fetch(
        `https://api.os.uk/maps/raster/v1/zxy/Light_3857/10/511/340.png?key=${OS_API_KEY}`
      );
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("image");
    });
  });

  describe("OS Vector Tile API", () => {
    it("returns a valid style JSON for 3857 projection", async () => {
      const res = await fetch(
        `https://api.os.uk/maps/vector/v1/vts/resources/styles?srs=3857&key=${OS_API_KEY}`
      );
      expect(res.ok).toBe(true);
      const style = await res.json();
      expect(style.version).toBe(8);
      expect(style.sources).toBeDefined();
      expect(style.sources.esri).toBeDefined();
      expect(style.layers).toBeDefined();
      expect(style.layers.length).toBeGreaterThan(10);
    });

    it("returns valid TileJSON for 3857", async () => {
      const res = await fetch(
        `https://api.os.uk/maps/vector/v1/vts?key=${OS_API_KEY}&srs=3857`
      );
      expect(res.ok).toBe(true);
      const tj = await res.json();
      expect(tj.tiles).toBeDefined();
      expect(tj.tiles.length).toBeGreaterThan(0);
      expect(tj.tiles[0]).toContain("pbf");
    });
  });

  describe("OS Features API (WFS)", () => {
    it("returns GeoJSON for Zoomstack_RailwayStations", async () => {
      const params = new URLSearchParams({
        service: "wfs",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: "Zoomstack_RailwayStations",
        outputFormat: "GEOJSON",
        srsName: "urn:ogc:def:crs:EPSG::4326",
        count: "5",
        key: OS_API_KEY,
      });
      const res = await fetch(`https://api.os.uk/features/v1/wfs?${params}`);
      expect(res.ok).toBe(true);
      const geojson = await res.json();
      expect(geojson.type).toBe("FeatureCollection");
      expect(geojson.features).toBeDefined();
      expect(geojson.features.length).toBeGreaterThan(0);
    });

    it("returns GeoJSON for Zoomstack_Boundaries with bbox", async () => {
      const params = new URLSearchParams({
        service: "wfs",
        version: "2.0.0",
        request: "GetFeature",
        typeNames: "Zoomstack_Boundaries",
        outputFormat: "GEOJSON",
        srsName: "urn:ogc:def:crs:EPSG::4326",
        count: "5",
        bbox: "51.4,-0.2,51.6,0.0",
        key: OS_API_KEY,
      });
      const res = await fetch(`https://api.os.uk/features/v1/wfs?${params}`);
      expect(res.ok).toBe(true);
      const geojson = await res.json();
      expect(geojson.type).toBe("FeatureCollection");
    });
  });
});
