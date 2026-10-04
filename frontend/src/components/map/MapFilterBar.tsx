"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, RotateCcw, ChevronRight } from "lucide-react";
import { useTranslation } from "@/i18n";

export interface MapFilterBarProps {
    viewMode: string;
    onViewChange: (mode: string) => void;
    selectedCrop: string;
    onCropChange: (crop: string) => void;
    cropList?: string[];
    selectedState: any;
    onStateSelect: (stateObj: any) => void;
    statesList?: any[];
    selectedDistrict: any;
    onDistrictSelect: (distObj: any) => void;
    onResetView: () => void;
    onNavigateIndia: () => void;
    onNavigateState: () => void;
    searchItems?: any[];
}

export default function MapFilterBar({
    viewMode,
    onViewChange,
    selectedCrop,
    onCropChange,
    cropList = [],
    selectedState,
    onStateSelect,
    statesList = [],
    selectedDistrict,
    onDistrictSelect,
    onResetView,
    onNavigateIndia,
    onNavigateState,
    searchItems = []
}: MapFilterBarProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);
    const [filteredResults, setFilteredResults] = useState<any[]>([]);
    const searchWrapRef = useRef<HTMLDivElement | null>(null);

    // Close search dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSearchChange = (val: string) => {
        setSearchQuery(val);
        if (!val.trim()) {
            setFilteredResults([]);
            setShowDropdown(false);
            return;
        }

        const q = val.toLowerCase().trim();
        const matches = searchItems
            .filter((item: any) => item.name && item.name.toLowerCase().includes(q))
            .slice(0, 12);

        setFilteredResults(matches);
        setShowDropdown(matches.length > 0);
    };

    const handleSelectSearchResult = (item: any) => {
        setShowDropdown(false);
        setSearchQuery("");

        if (item.type === "state") {
            onStateSelect({
                geo_id: item.geo_id,
                state_name: item.state_name || item.name,
                zone: item.zone,
                total_districts: item.total_districts,
                crops_count: item.crops_count
            });
        } else if (item.type === "district") {
            const stObj = statesList.find((s: any) => s.geo_id === item.state_geo_id) || {
                geo_id: item.state_geo_id,
                state_name: item.state_name,
                zone: item.zone
            };
            onStateSelect(stObj);
            onDistrictSelect({
                geo_id: item.geo_id,
                district_name: item.name,
                state_name: item.state_name,
                state_geo_id: item.state_geo_id,
                agro_climatic_zone: item.zone
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            setShowDropdown(false);
            setSearchQuery("");
        }
    };

    return (
        <div className="agri-filter-bar">
            <div className="agri-filter-row">
                {/* Left: View / Crop / State controls */}
                <div className="agri-filter-group">
                    <div className="agri-filter-item">
                        <label htmlFor="agri-view-select" className="agri-filter-label">{t("map.view")}</label>
                        <select
                            id="agri-view-select"
                            className="agri-select"
                            value={viewMode}
                            onChange={(e) => onViewChange(e.target.value)}
                        >
                            <option value="overview">{t("map.views.overview")}</option>
                            <option value="rainfall">{t("map.views.rainfall")}</option>
                            <option value="warnings">{t("map.views.warnings")}</option>
                            <option value="market">{t("map.views.market")}</option>
                            <option value="soil">{t("map.views.soil")}</option>
                        </select>
                    </div>

                    <div className="agri-filter-item">
                        <label htmlFor="agri-crop-select" className="agri-filter-label">{t("map.crop")}</label>
                        <select
                            id="agri-crop-select"
                            className="agri-select"
                            value={selectedCrop}
                            onChange={(e) => onCropChange(e.target.value)}
                        >
                            <option value="">{t("map.allCrops", { count: cropList.length })}</option>
                            {cropList.map((crop) => (
                                <option key={crop} value={crop}>{crop}</option>
                            ))}
                        </select>
                    </div>

                    <div className="agri-filter-item">
                        <label htmlFor="agri-state-select" className="agri-filter-label">{t("map.state")}</label>
                        <select
                            id="agri-state-select"
                            className="agri-select"
                            value={selectedState?.geo_id || ""}
                            onChange={(e) => {
                                const gid = e.target.value;
                                if (!gid) {
                                    onNavigateIndia();
                                } else {
                                    const s = statesList.find((st: any) => st.geo_id === gid);
                                    if (s) onStateSelect(s);
                                }
                            }}
                        >
                            <option value="">{t("map.allIndia")}</option>
                            {statesList.map((s: any) => (
                                <option key={s.geo_id} value={s.geo_id}>{s.state_name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Right: Search Box + Reset */}
                <div className="agri-filter-group">
                    <div className="agri-search-wrap" ref={searchWrapRef}>
                        <div className="agri-search-input-wrap">
                            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <input
                                type="text"
                                className="agri-search-input"
                                placeholder={t("map.searchPlaceholder")}
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                onFocus={() => searchQuery.trim() && filteredResults.length > 0 && setShowDropdown(true)}
                                onKeyDown={handleKeyDown}
                                aria-label={t("map.searchPlaceholder")}
                                autoComplete="off"
                            />
                        </div>

                        {showDropdown && filteredResults.length > 0 && (
                            <div className="agri-search-dropdown" role="listbox">
                                {filteredResults.map((item: any, idx: number) => (
                                    <button
                                        key={`${item.geo_id || idx}`}
                                        type="button"
                                        className="agri-search-item"
                                        onClick={() => handleSelectSearchResult(item)}
                                    >
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-slate-100">{item.name}</span>
                                            {item.type === "district" && (
                                                <span className="text-[11px] text-slate-400">
                                                    {item.state_name}
                                                </span>
                                            )}
                                        </div>
                                        <span className="agri-search-type-tag">
                                            {item.type === "state" ? t("map.state") : t("map.district")}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className="agri-reset-btn"
                        onClick={onResetView}
                        title={t("common.reset")}
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t("common.reset")}</span>
                    </button>
                </div>
            </div>

            {/* Breadcrumb Navigation */}
            <nav className="agri-breadcrumbs" aria-label="Map breadcrumb">
                <button
                    type="button"
                    className={selectedState ? "agri-breadcrumb-link" : "agri-breadcrumb-current"}
                    onClick={selectedState ? onNavigateIndia : undefined}
                >
                    {t("map.india")}
                </button>

                {selectedState && (
                    <>
                        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                        <button
                            type="button"
                            className={selectedDistrict ? "agri-breadcrumb-link" : "agri-breadcrumb-current"}
                            onClick={selectedDistrict ? onNavigateState : undefined}
                        >
                            {selectedState.state_name}
                        </button>
                    </>
                )}

                {selectedDistrict && (
                    <>
                        <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="agri-breadcrumb-current">
                            {selectedDistrict.district_name}
                        </span>
                    </>
                )}
            </nav>
        </div>
    );
}
