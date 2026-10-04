"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import MapFilterBar from "./MapFilterBar";
import MapSidePanel from "./MapSidePanel";
import "./agriculture-map.css";

// Dynamic import for Leaflet canvas with SSR disabled
const IndiaMapCanvas = dynamic(() => import("./IndiaMapCanvas"), {
    ssr: false,
    loading: () => (
        <div className="agri-map-loading">
            <div className="agri-spinner" />
            <span>Initializing interactive geospatial intelligence map…</span>
        </div>
    ),
});

export default function AgricultureMap() {
    const [statesSummary, setStatesSummary] = useState<Record<string, any>>({});
    const [cropIndex, setCropIndex] = useState<{ crops: string[]; crop_to_states: Record<string, string[]>; crop_to_districts: Record<string, string[]> }>({
        crops: [],
        crop_to_states: {},
        crop_to_districts: {}
    });
    const [searchItems, setSearchItems] = useState<any[]>([]);
    const [districtsDataByState, setDistrictsDataByState] = useState<Record<string, Record<string, any>>>({});

    const [selectedCrop, setSelectedCrop] = useState<string>("");
    const [viewMode, setViewMode] = useState<string>("overview");

    const [selectedState, setSelectedState] = useState<any>(null);
    const [selectedDistrict, setSelectedDistrict] = useState<any>(null);

    // 1. Fetch initial states summary, crop filter index, and search index
    useEffect(() => {
        fetch("/data/agri/states_summary.json")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load states summary");
                return res.json();
            })
            .then((data) => setStatesSummary(data))
            .catch((err) => console.error("Error loading states summary:", err));

        fetch("/data/agri/crop_filter_index.json")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load crop index");
                return res.json();
            })
            .then((data) => setCropIndex(data))
            .catch((err) => console.error("Error loading crop index:", err));

        fetch("/data/agri/search_index.json")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load search index");
                return res.json();
            })
            .then((data) => setSearchItems(data))
            .catch((err) => console.error("Error loading search index:", err));
    }, []);

    // 2. Fetch district details when a state is selected
    const handleSelectState = (stateObj: any) => {
        setSelectedState(stateObj);
        setSelectedDistrict(null);

        const gid = stateObj.geo_id;
        if (gid && !districtsDataByState[gid]) {
            fetch(`/data/agri/districts_by_state/${gid}.json`)
                .then((res) => {
                    if (!res.ok) throw new Error(`District data not found for ${gid}`);
                    return res.json();
                })
                .then((data) => {
                    setDistrictsDataByState((prev) => ({ ...prev, [gid]: data }));
                })
                .catch((err) => console.warn(`Could not load district agri data for ${gid}:`, err));
        }
    };

    const handleSelectDistrict = (distObj: any) => {
        if (!selectedState && distObj.state_geo_id) {
            const parentState = statesSummary[distObj.state_geo_id] || {
                geo_id: distObj.state_geo_id,
                state_name: distObj.state_name
            };
            setSelectedState(parentState);
            fetch(`/data/agri/districts_by_state/${distObj.state_geo_id}.json`)
                .then((res) => res.json())
                .then((data) => {
                    setDistrictsDataByState((prev) => ({ ...prev, [distObj.state_geo_id]: data }));
                    setSelectedDistrict(data[distObj.geo_id] || distObj);
                })
                .catch(() => setSelectedDistrict(distObj));
            return;
        }

        const stateDistricts = selectedState ? districtsDataByState[selectedState.geo_id] : null;
        const fullDistObj = (stateDistricts && stateDistricts[distObj.geo_id]) ? stateDistricts[distObj.geo_id] : distObj;
        setSelectedDistrict(fullDistObj);
    };

    // Ensure selectedDistrict syncs when full state district dictionary loads
    useEffect(() => {
        if (selectedState && selectedDistrict && districtsDataByState[selectedState.geo_id]) {
            const full = districtsDataByState[selectedState.geo_id][selectedDistrict.geo_id];
            if (full && (!selectedDistrict.rainfall || !selectedDistrict.weather_warning)) {
                setSelectedDistrict(full);
            }
        }
    }, [districtsDataByState, selectedState, selectedDistrict]);

    const handleResetView = () => {
        setSelectedState(null);
        setSelectedDistrict(null);
        setSelectedCrop("");
        setViewMode("overview");
    };

    const handleNavigateIndia = () => {
        setSelectedState(null);
        setSelectedDistrict(null);
    };

    const handleNavigateState = () => {
        setSelectedDistrict(null);
    };

    const handleCropClick = (crop: string) => {
        setSelectedCrop((prev) => (prev === crop ? "" : crop));
    };

    const statesList = Object.values(statesSummary).sort((a: any, b: any) =>
        (a.state_name || "").localeCompare(b.state_name || "")
    );

    return (
        <div className="agri-map-root">
            {/* Filter & Exploration Toolbar */}
            <MapFilterBar
                viewMode={viewMode}
                onViewChange={setViewMode}
                selectedCrop={selectedCrop}
                onCropChange={setSelectedCrop}
                cropList={cropIndex.crops || []}
                selectedState={selectedState}
                onStateSelect={handleSelectState}
                statesList={statesList}
                selectedDistrict={selectedDistrict}
                onDistrictSelect={handleSelectDistrict}
                onResetView={handleResetView}
                onNavigateIndia={handleNavigateIndia}
                onNavigateState={handleNavigateState}
                searchItems={searchItems}
            />

            {/* Responsive Map & Contextual Info Panel Grid (70% / 30%) */}
            <div className="agri-map-layout-grid">
                <IndiaMapCanvas
                    statesSummary={statesSummary}
                    selectedCrop={selectedCrop}
                    viewMode={viewMode}
                    cropToStates={cropIndex.crop_to_states || {}}
                    cropToDistricts={cropIndex.crop_to_districts || {}}
                    selectedState={selectedState}
                    selectedDistrict={selectedDistrict}
                    onSelectState={handleSelectState}
                    onSelectDistrict={handleSelectDistrict}
                    districtsDataByState={districtsDataByState}
                />

                <MapSidePanel
                    selectedState={selectedState}
                    selectedDistrict={selectedDistrict}
                    stateSummary={selectedState ? statesSummary[selectedState.geo_id] : null}
                    districtData={selectedDistrict}
                    selectedCrop={selectedCrop}
                    viewMode={viewMode}
                    onCropClick={handleCropClick}
                    districtsData={selectedState ? (districtsDataByState[selectedState.geo_id] || {}) : {}}
                    onSelectDistrict={handleSelectDistrict}
                />
            </div>
        </div>
    );
}
