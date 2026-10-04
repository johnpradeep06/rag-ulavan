"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MapLegend from "./MapLegend";
import {
    normalizeRainfall,
    normalizeWeatherWarning,
    normalizeMarket,
    normalizeSoil,
    THEME_COLORS,
    NormalizedRainfall,
} from "@/lib/agriMapAdapter";
import { Maximize2, RotateCcw } from "lucide-react";
import { useTranslation } from "@/i18n";

const INDIA_CENTER: [number, number] = [22.5, 82.0];
const INDIA_ZOOM = 4.8;

export interface IndiaMapCanvasProps {
    statesSummary: Record<string, any>;
    selectedCrop: string;
    viewMode: string;
    cropToStates: Record<string, string[]>;
    cropToDistricts: Record<string, string[]>;
    selectedState: any;
    selectedDistrict: any;
    onSelectState: (stateObj: any) => void;
    onSelectDistrict: (distObj: any) => void;
    districtsDataByState: Record<string, Record<string, any>>;
}

export default function IndiaMapCanvas({
    statesSummary = {},
    selectedCrop = "",
    viewMode = "overview",
    cropToStates = {},
    cropToDistricts = {},
    selectedState = null,
    selectedDistrict = null,
    onSelectState,
    onSelectDistrict,
    districtsDataByState = {}
}: IndiaMapCanvasProps) {
    const { t } = useTranslation();
    const mapContainerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<L.Map | null>(null);
    const stateLayerRef = useRef<L.GeoJSON | null>(null);
    const districtLayerRef = useRef<L.GeoJSON | null>(null);

    const [loadingMap, setLoadingMap] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [statesGeoJson, setStatesGeoJson] = useState<any>(null);

    // 1. Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current || mapInstanceRef.current) return;

        const map = L.map(mapContainerRef.current, {
            center: INDIA_CENTER,
            zoom: INDIA_ZOOM,
            minZoom: 4,
            maxZoom: 14,
            zoomControl: false, // Customized position
            scrollWheelZoom: true,
            zoomSnap: 0.5,
            zoomDelta: 0.5,
        });

        // CartoDB Dark Matter tiles (100% free, dark geospatial intelligence style, NO API key required)
        const darkTileLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
        }).addTo(map);

        // Fallback to OSM if cartocdn fails
        darkTileLayer.on("tileerror", () => {
            console.warn("CartoDB tile load failed, using OpenStreetMap fallback");
            L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: '&copy; OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map);
        });

        L.control.zoom({ position: "topright" }).addTo(map);
        mapInstanceRef.current = map;

        fetch("/data/geo/india_states.geojson")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load India states boundary GeoJSON");
                return res.json();
            })
            .then((data) => {
                setStatesGeoJson(data);
                setLoadingMap(false);
            })
            .catch((err) => {
                console.error("GeoJSON load error:", err);
                setErrorMsg("Map boundaries could not be loaded. Please check data files.");
                setLoadingMap(false);
            });

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, []);

    // 2. State Polygon Style (strictly decoupled by viewMode)
    const getStateStyle = (feature: any) => {
        const geoId = feature?.properties?.geo_id;
        const summary = statesSummary[geoId] || {};
        const hasCropMatch = selectedCrop ? Boolean(cropToStates[selectedCrop]?.includes(geoId)) : true;

        // Dim if crop filter is set and this state has no records for that crop
        if (selectedCrop && !hasCropMatch) {
            return {
                fillColor: THEME_COLORS.noDataMuted,
                weight: 0.8,
                opacity: 0.6,
                color: "rgba(51, 65, 85, 0.4)",
                fillOpacity: 0.1,
                className: "interactive-polygon",
            };
        }

        // Rainfall View Mode
        if (viewMode === "rainfall") {
            const rStatus = summary.rainfall_status || "No Data";
            let fillColor = THEME_COLORS.noDataMuted;
            let fillOpacity = 0.2;

            if (rStatus === "Large Excess") { fillColor = THEME_COLORS.rainLargeExcess; fillOpacity = 0.65; }
            else if (rStatus === "Excess") { fillColor = THEME_COLORS.rainExcess; fillOpacity = 0.6; }
            else if (rStatus === "Normal") { fillColor = THEME_COLORS.rainNormal; fillOpacity = 0.55; }
            else if (rStatus === "Deficient") { fillColor = THEME_COLORS.rainDeficient; fillOpacity = 0.6; }
            else if (rStatus === "Large Deficient") { fillColor = THEME_COLORS.rainLargeDeficient; fillOpacity = 0.65; }

            return {
                fillColor,
                weight: 1,
                opacity: 0.8,
                color: "rgba(255, 255, 255, 0.15)",
                fillOpacity,
                className: "interactive-polygon",
            };
        }

        // Weather Warnings View Mode
        if (viewMode === "warnings") {
            const wColor = summary.warning_color || "Green";
            let fillColor = THEME_COLORS.warnGreen;
            if (wColor === "Red") fillColor = THEME_COLORS.warnRed;
            else if (wColor === "Orange") fillColor = THEME_COLORS.warnOrange;
            else if (wColor === "Yellow") fillColor = THEME_COLORS.warnYellow;

            return {
                fillColor,
                weight: 1,
                opacity: 0.8,
                color: "rgba(255, 255, 255, 0.18)",
                fillOpacity: 0.55,
                className: "interactive-polygon",
            };
        }

        // Market View Mode
        if (viewMode === "market") {
            const hasMkt = summary.available_info?.market_prices?.available;
            return {
                fillColor: hasMkt ? THEME_COLORS.marketActive : THEME_COLORS.noDataMuted,
                weight: 1,
                opacity: 0.8,
                color: "rgba(255, 255, 255, 0.15)",
                fillOpacity: hasMkt ? 0.6 : 0.12,
                className: "interactive-polygon",
            };
        }

        // Soil View Mode
        if (viewMode === "soil") {
            const hasSoil = summary.available_info?.soil_observations?.available;
            return {
                fillColor: hasSoil ? THEME_COLORS.soilActive : THEME_COLORS.noDataMuted,
                weight: 1,
                opacity: 0.8,
                color: "rgba(255, 255, 255, 0.15)",
                fillOpacity: hasSoil ? 0.6 : 0.12,
                className: "interactive-polygon",
            };
        }

        // Overview View Mode (Crop cultivation or general data coverage)
        if (selectedCrop) {
            return {
                fillColor: hasCropMatch ? THEME_COLORS.coverageMid : THEME_COLORS.noDataMuted,
                weight: hasCropMatch ? 1.4 : 0.8,
                opacity: 0.8,
                color: hasCropMatch ? "#4ade80" : "rgba(148, 163, 184, 0.2)",
                fillOpacity: hasCropMatch ? 0.6 : 0.1,
                className: "interactive-polygon",
            };
        }

        const coverage = summary.coverage_level || "basic";
        let fillColor = THEME_COLORS.noDataMuted;
        let fillOpacity = 0.18;
        if (coverage === "high") { fillColor = THEME_COLORS.coverageHigh; fillOpacity = 0.6; }
        else if (coverage === "medium") { fillColor = THEME_COLORS.coverageMid; fillOpacity = 0.45; }
        else if (coverage === "basic") { fillColor = THEME_COLORS.coverageBasic; fillOpacity = 0.3; }

        return {
            fillColor,
            weight: 1,
            opacity: 0.8,
            color: "rgba(255, 255, 255, 0.15)",
            fillOpacity,
            className: "interactive-polygon",
        };
    };

    // 3. Render / Update States Layer
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !statesGeoJson) return;

        if (selectedState) {
            if (stateLayerRef.current) {
                map.removeLayer(stateLayerRef.current);
                stateLayerRef.current = null;
            }
            return;
        }

        if (stateLayerRef.current) {
            map.removeLayer(stateLayerRef.current);
            stateLayerRef.current = null;
        }

        const onEachState = (feature: any, layer: L.Layer) => {
            const props = feature.properties || {};
            const geoId = props.geo_id;
            const summary = statesSummary[geoId] || {};

            const distCount = summary.total_districts || props.total_districts || 0;
            const cropCount = summary.crops_count || 0;
            const hasCrop = selectedCrop && cropToStates[selectedCrop]?.includes(geoId);

            // View-specific rich tooltip
            let tooltipBody = "";
            if (viewMode === "rainfall") {
                const rfStatus = summary.rainfall_status || "No Data";
                tooltipBody = `
                    <div class="tooltip-row"><span class="tooltip-dim">Rainfall Status:</span> <strong class="tooltip-val">${rfStatus}</strong></div>
                    <div class="tooltip-row"><span class="tooltip-dim">Reporting:</span> ${summary.available_info?.rainfall?.district_count || 0} districts</div>
                    <div class="tooltip-source">Source: IMD Daily Rainfall Bulletin</div>
                `;
            } else if (viewMode === "warnings") {
                const warnColor = summary.warning_color || "Green";
                tooltipBody = `
                    <div class="tooltip-row"><span class="tooltip-dim">Warning Level:</span> <strong class="tooltip-val">${warnColor}</strong></div>
                    <div class="tooltip-row"><span class="tooltip-dim">Coverage:</span> ${summary.available_info?.weather_warning?.district_count || 0} districts</div>
                    <div class="tooltip-source">Source: IMD District Weather Warning</div>
                `;
            } else if (viewMode === "market") {
                const mktAvail = summary.available_info?.market_prices?.available;
                tooltipBody = `
                    <div class="tooltip-row"><span class="tooltip-dim">Mandi Prices:</span> <strong class="tooltip-val">${mktAvail ? "Active Records" : "No Market Reports"}</strong></div>
                    <div class="tooltip-source">Source: Agmarknet API</div>
                `;
            } else if (viewMode === "soil") {
                const soilAvail = summary.available_info?.soil_observations?.available;
                tooltipBody = `
                    <div class="tooltip-row"><span class="tooltip-dim">Soil Profiles:</span> <strong class="tooltip-val">${soilAvail ? "Laboratory Records" : "No Soil Records"}</strong></div>
                    <div class="tooltip-source">Source: Soil Health System</div>
                `;
            } else {
                tooltipBody = `
                    <div class="tooltip-row"><span class="tooltip-dim">Coverage:</span> <strong>${distCount}</strong> dists · <strong>${cropCount}</strong> crops</div>
                    <div class="tooltip-source">Bharat Krishi Digital Atlas</div>
                `;
            }

            const tooltipContent = `
                <div class="leaflet-tooltip-custom">
                    <div class="tooltip-title">${props.state_name}</div>
                    <div class="tooltip-meta">${props.zone || ""} Zone${props.capital ? " · " + props.capital : ""}</div>
                    ${tooltipBody}
                    ${selectedCrop ? (hasCrop
                        ? `<div class="tooltip-tag success">🌾 ${selectedCrop} recorded</div>`
                        : `<div class="tooltip-tag muted">No ${selectedCrop} records</div>`)
                        : ""}
                </div>
            `;

            layer.bindTooltip(tooltipContent, {
                sticky: true,
                direction: "top",
                offset: [0, -8],
            });

            const pathLayer = layer as L.Path;
            pathLayer.on({
                mouseover: (e: L.LeafletMouseEvent) => {
                    const l = e.target;
                    l.setStyle({
                        weight: 2.2,
                        color: "#38bdf8",
                        fillOpacity: Math.min(0.85, (l.options.fillOpacity || 0.2) + 0.22),
                    });
                    if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                        l.bringToFront();
                    }
                },
                mouseout: (e: L.LeafletMouseEvent) => {
                    if (stateLayerRef.current) {
                        stateLayerRef.current.resetStyle(e.target);
                    }
                },
                click: (e: L.LeafletMouseEvent) => {
                    if (e && e.originalEvent) {
                        L.DomEvent.stopPropagation(e);
                    }
                    onSelectState({
                        geo_id: geoId,
                        state_name: props.state_name,
                        zone: props.zone,
                        total_districts: distCount,
                        crops_count: cropCount,
                    });
                },
            });
        };

        const layer = L.geoJSON(statesGeoJson, {
            style: getStateStyle,
            onEachFeature: onEachState,
        }).addTo(map);

        stateLayerRef.current = layer;

        if (!selectedState) {
            map.setView(INDIA_CENTER, INDIA_ZOOM);
        }
    }, [statesGeoJson, statesSummary, selectedCrop, viewMode, selectedState, cropToStates]);

    // 4. District Polygon Style (strictly decoupled by viewMode)
    const getDistrictStyle = (feature: any, stateDistricts: Record<string, any>) => {
        const dGid = feature?.properties?.geo_id;
        const dInfo = stateDistricts[dGid] || {};
        const isSelected = selectedDistrict && selectedDistrict.geo_id === dGid;

        // Selected District Outline
        if (isSelected) {
            return {
                fillColor: THEME_COLORS.selectedBorder,
                weight: 2.8,
                color: "#fbbf24",
                fillOpacity: 0.85,
            };
        }

        const hasCropMatch = selectedCrop ? (
            Boolean(dInfo.recorded_crops?.includes(selectedCrop)) ||
            Boolean(cropToDistricts[selectedCrop]?.includes(dGid))
        ) : true;

        // If crop filter is set and district does not grow that crop, dim out
        if (selectedCrop && !hasCropMatch) {
            return {
                fillColor: THEME_COLORS.noDataMuted,
                weight: 0.6,
                color: "rgba(51, 65, 85, 0.4)",
                fillOpacity: 0.08,
            };
        }

        // Rainfall View Mode
        if (viewMode === "rainfall") {
            const rf = normalizeRainfall(dInfo.rainfall);
            if (!rf.hasData) {
                return {
                    fillColor: THEME_COLORS.noDataMuted,
                    weight: 0.8,
                    color: "rgba(255, 255, 255, 0.12)",
                    fillOpacity: 0.15,
                };
            }

            let fillColor = THEME_COLORS.rainNormal;
            if (rf.category === "Large Excess") fillColor = THEME_COLORS.rainLargeExcess;
            else if (rf.category === "Excess") fillColor = THEME_COLORS.rainExcess;
            else if (rf.category === "Normal") fillColor = THEME_COLORS.rainNormal;
            else if (rf.category === "Deficient") fillColor = THEME_COLORS.rainDeficient;
            else if (rf.category === "Large Deficient") fillColor = THEME_COLORS.rainLargeDeficient;

            return {
                fillColor,
                weight: 1,
                color: "rgba(255, 255, 255, 0.18)",
                fillOpacity: 0.65,
            };
        }

        // Weather Warnings View Mode
        if (viewMode === "warnings") {
            const ww = normalizeWeatherWarning(dInfo.weather_warning);
            if (!ww.hasData) {
                return {
                    fillColor: THEME_COLORS.noDataMuted,
                    weight: 0.8,
                    color: "rgba(255, 255, 255, 0.12)",
                    fillOpacity: 0.15,
                };
            }

            let fillColor = THEME_COLORS.warnGreen;
            if (ww.colorCode === "Red") fillColor = THEME_COLORS.warnRed;
            else if (ww.colorCode === "Orange") fillColor = THEME_COLORS.warnOrange;
            else if (ww.colorCode === "Yellow") fillColor = THEME_COLORS.warnYellow;

            return {
                fillColor,
                weight: 1,
                color: "rgba(255, 255, 255, 0.18)",
                fillOpacity: 0.65,
            };
        }

        // Market View Mode
        if (viewMode === "market") {
            const mkt = normalizeMarket(dInfo.market);
            return {
                fillColor: mkt.hasData ? THEME_COLORS.marketActive : THEME_COLORS.noDataMuted,
                weight: 1,
                color: "rgba(255, 255, 255, 0.18)",
                fillOpacity: mkt.hasData ? 0.65 : 0.12,
            };
        }

        // Soil View Mode
        if (viewMode === "soil") {
            const soil = normalizeSoil(dInfo.soil);
            return {
                fillColor: soil.hasData ? THEME_COLORS.soilActive : THEME_COLORS.noDataMuted,
                weight: 1,
                color: "rgba(255, 255, 255, 0.18)",
                fillOpacity: soil.hasData ? 0.65 : 0.12,
            };
        }

        // Overview View Mode
        if (selectedCrop) {
            return {
                fillColor: hasCropMatch ? THEME_COLORS.coverageMid : THEME_COLORS.noDataMuted,
                weight: hasCropMatch ? 1.4 : 0.8,
                color: hasCropMatch ? "#4ade80" : "rgba(255, 255, 255, 0.12)",
                fillOpacity: hasCropMatch ? 0.65 : 0.1,
            };
        }

        const rf = normalizeRainfall(dInfo.rainfall);
        const ww = normalizeWeatherWarning(dInfo.weather_warning);
        const mkt = normalizeMarket(dInfo.market);
        const soil = normalizeSoil(dInfo.soil);
        const score = [rf.hasData, ww.hasData, mkt.hasData, soil.hasData].filter(Boolean).length;

        let fillColor = THEME_COLORS.noDataMuted;
        let fillOpacity = 0.15;
        if (score >= 3) { fillColor = THEME_COLORS.coverageHigh; fillOpacity = 0.65; }
        else if (score >= 1) { fillColor = THEME_COLORS.coverageBasic; fillOpacity = 0.4; }

        return {
            fillColor,
            weight: 1,
            color: "rgba(255, 255, 255, 0.18)",
            fillOpacity,
        };
    };

    // 5. Load & Render District Layer
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;

        if (!selectedState) {
            if (districtLayerRef.current) {
                map.removeLayer(districtLayerRef.current);
                districtLayerRef.current = null;
            }
            return;
        }

        setLoadingMap(true);
        const stateGeoId = selectedState.geo_id;

        fetch(`/data/geo/districts/${stateGeoId}.geojson`)
            .then((res) => {
                if (!res.ok) throw new Error(`District boundaries not found for ${stateGeoId}`);
                return res.json();
            })
            .then((districtGeoJson) => {
                if (districtLayerRef.current) {
                    map.removeLayer(districtLayerRef.current);
                    districtLayerRef.current = null;
                }

                const stateDistricts = districtsDataByState[stateGeoId] || {};

                const onEachDistrict = (feature: any, layer: L.Layer) => {
                    const props = feature.properties || {};
                    const dGid = props.geo_id;
                    const dInfo = stateDistricts[dGid] || {};

                    const rf = normalizeRainfall(dInfo.rainfall);
                    const ww = normalizeWeatherWarning(dInfo.weather_warning);
                    const mkt = normalizeMarket(dInfo.market);
                    const soil = normalizeSoil(dInfo.soil);
                    const hasCrop = selectedCrop && (
                        (dInfo.recorded_crops || []).includes(selectedCrop) ||
                        cropToDistricts[selectedCrop]?.includes(dGid)
                    );

                    // View-specific district tooltip
                    let tooltipBody = "";
                    if (viewMode === "rainfall") {
                        if (rf.hasData) {
                            const depSign = rf.departurePct !== null && rf.departurePct > 0 ? "+" : "";
                            const depStr = rf.departurePct !== null ? `${depSign}${rf.departurePct}%` : "";
                            tooltipBody = `
                                <div class="tooltip-metric-grid">
                                    <div class="tooltip-metric">
                                        <div class="tooltip-dim">Actual Rain</div>
                                        <div class="tooltip-val large">${rf.actualMm !== null ? `${rf.actualMm} mm` : "N/A"}</div>
                                    </div>
                                    <div class="tooltip-metric">
                                        <div class="tooltip-dim">Normal (LPA)</div>
                                        <div class="tooltip-val">${rf.normalMm !== null ? `${rf.normalMm} mm` : "N/A"}</div>
                                    </div>
                                </div>
                                <div class="tooltip-row"><span class="tooltip-dim">Departure:</span> <strong class="tooltip-val">${depStr} · ${rf.category}</strong></div>
                                <div class="tooltip-source">${rf.bulletinDate || "09 Sep 2026"} · ${rf.source}</div>
                            `;
                        } else {
                            tooltipBody = `
                                <div class="tooltip-empty">No rainfall bulletin on file for this district</div>
                                <div class="tooltip-source">IMD District Rainfall Bulletin</div>
                            `;
                        }
                    } else if (viewMode === "warnings") {
                        if (ww.hasData) {
                            tooltipBody = `
                                <div class="tooltip-row"><span class="tooltip-dim">Alert Level:</span> <strong class="tooltip-val ${ww.colorCode.toLowerCase()}">${ww.alertLevel} (${ww.colorCode})</strong></div>
                                <div class="tooltip-row"><span class="tooltip-dim">Hazard:</span> ${ww.hazard}</div>
                                <div class="tooltip-source">${ww.validToday || "Valid Today"} · ${ww.source}</div>
                            `;
                        } else {
                            tooltipBody = `
                                <div class="tooltip-empty">No active weather warnings recorded</div>
                                <div class="tooltip-source">IMD District Weather Warning</div>
                            `;
                        }
                    } else if (viewMode === "market") {
                        if (mkt.hasData && mkt.commodities.length > 0) {
                            const topItems = mkt.commodities.slice(0, 2).map((c) =>
                                `${c.commodity}${c.modalPrice ? `: ₹${c.modalPrice}/q` : ""}`
                            ).join(", ");
                            tooltipBody = `
                                <div class="tooltip-row"><span class="tooltip-dim">Arrivals:</span> <strong>${mkt.count} reports</strong></div>
                                <div class="tooltip-row"><span class="tooltip-dim">Sample:</span> ${topItems}</div>
                                <div class="tooltip-source">${mkt.source}</div>
                            `;
                        } else {
                            tooltipBody = `
                                <div class="tooltip-empty">No APMC Mandi arrivals reported</div>
                                <div class="tooltip-source">Agmarknet Mandi API</div>
                            `;
                        }
                    } else if (viewMode === "soil") {
                        if (soil.hasData) {
                            tooltipBody = `
                                <div class="tooltip-row"><span class="tooltip-dim">Soil:</span> <strong>${soil.soilType}</strong></div>
                                <div class="tooltip-row"><span class="tooltip-dim">Chemistry:</span> pH ${soil.phRange} · OC ${soil.organicCarbon}</div>
                                <div class="tooltip-source">${soil.source}</div>
                            `;
                        } else {
                            tooltipBody = `
                                <div class="tooltip-empty">No soil laboratory profile on record</div>
                                <div class="tooltip-source">Soil Health System</div>
                            `;
                        }
                    } else {
                        const cropsList = (dInfo.recorded_crops && dInfo.recorded_crops.length > 0)
                            ? dInfo.recorded_crops.slice(0, 3).join(", ") + (dInfo.recorded_crops.length > 3 ? " …" : "")
                            : "No crop records";
                        tooltipBody = `
                            <div class="tooltip-row"><span class="tooltip-dim">Crops:</span> 🌾 ${cropsList}</div>
                            <div class="tooltip-row"><span class="tooltip-dim">Domains:</span> ${rf.hasData ? "Rain " : ""}${ww.hasData ? "Warn " : ""}${mkt.hasData ? "Mkt " : ""}${soil.hasData ? "Soil" : ""}</div>
                        `;
                    }

                    const tooltipContent = `
                        <div class="leaflet-tooltip-custom">
                            <div class="tooltip-title">${props.district_name}</div>
                            <div class="tooltip-meta">${props.state_name}${props.agro_climatic_zone ? " · " + props.agro_climatic_zone : ""}</div>
                            ${tooltipBody}
                            ${selectedCrop ? (hasCrop
                                ? `<div class="tooltip-tag success">🌾 ${selectedCrop} recorded</div>`
                                : `<div class="tooltip-tag muted">No ${selectedCrop} records</div>`)
                                : ""}
                        </div>
                    `;

                    layer.bindTooltip(tooltipContent, {
                        sticky: true,
                        direction: "top",
                        offset: [0, -8],
                    });

                    const pathLayer = layer as L.Path;
                    pathLayer.on({
                        mouseover: (e: L.LeafletMouseEvent) => {
                            const l = e.target;
                            l.setStyle({
                                weight: 2.8,
                                color: "#38bdf8",
                                fillOpacity: Math.min(0.9, (l.options.fillOpacity || 0.2) + 0.25),
                            });
                            if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
                                l.bringToFront();
                            }
                        },
                        mouseout: (e: L.LeafletMouseEvent) => {
                            if (districtLayerRef.current) {
                                districtLayerRef.current.resetStyle(e.target);
                            }
                        },
                        click: (e: L.LeafletMouseEvent) => {
                            if (e && e.originalEvent) {
                                L.DomEvent.stopPropagation(e);
                            }
                            onSelectDistrict({
                                geo_id: dGid,
                                district_name: props.district_name,
                                state_name: props.state_name,
                                state_geo_id: stateGeoId,
                                agro_climatic_zone: props.agro_climatic_zone,
                                ...dInfo,
                            });
                            try {
                                const path = layer as L.Polygon;
                                const b = path.getBounds();
                                if (b && b.isValid()) {
                                    map.fitBounds(b, { maxZoom: 10, padding: [50, 50] });
                                }
                            } catch (err) {
                                /* ignore if bounds not available */
                            }
                        },
                    });
                };

                const distLayer = L.geoJSON(districtGeoJson, {
                    style: (feat) => getDistrictStyle(feat, stateDistricts),
                    onEachFeature: onEachDistrict,
                }).addTo(map);

                districtLayerRef.current = distLayer;

                try {
                    const bounds = distLayer.getBounds();
                    if (bounds.isValid()) {
                        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 8.5 });
                    }
                } catch (e) {
                    console.warn("Could not fit bounds to district layer:", e);
                }

                setLoadingMap(false);
            })
            .catch((err) => {
                console.warn("District GeoJSON not found:", err);
                setLoadingMap(false);
            });
    }, [selectedState, selectedDistrict, selectedCrop, viewMode, districtsDataByState, cropToDistricts]);

    // Handle fit India button
    const handleFitIndia = () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setView(INDIA_CENTER, INDIA_ZOOM);
        }
    };

    return (
        <div className="agri-map-wrapper">
            <div ref={mapContainerRef} className="agri-leaflet-container" />

            {/* Floating Top Controls (Fit India & Legend Toggle) */}
            <div className="agri-map-floating-controls">
                <button
                    type="button"
                    className="agri-map-ctrl-btn"
                    onClick={handleFitIndia}
                    title={t("map.fitIndia")}
                    aria-label={t("map.fitIndia")}
                >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>{t("map.fitIndia")}</span>
                </button>
            </div>

            {loadingMap && (
                <div className="agri-map-loading">
                    <div className="agri-spinner" />
                    <span>{t("common.loading")}</span>
                </div>
            )}

            {errorMsg && (
                <div className="agri-map-loading" style={{ background: "rgba(11, 15, 25, 0.95)" }}>
                    <span style={{ fontSize: "1.3rem" }}>⚠️</span>
                    <span style={{ color: "#f87171", fontWeight: 600 }}>{errorMsg}</span>
                </div>
            )}

            {/* Dynamic Thematic Legend */}
            <MapLegend
                selectedCrop={selectedCrop}
                viewMode={viewMode}
                hasSelectedState={Boolean(selectedState)}
            />
        </div>
    );
}
