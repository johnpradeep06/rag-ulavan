"use client";

import React, { useState } from "react";
import {
    CloudRain,
    AlertTriangle,
    Coins,
    FlaskConical,
    Calendar,
    BookOpen,
    CheckCircle2,
    XCircle,
    ChevronDown,
    ChevronUp,
    Sprout,
    HelpCircle,
} from "lucide-react";
import {
    normalizeRainfall,
    normalizeWeatherWarning,
    normalizeMarket,
    normalizeSoil,
    THEME_COLORS,
    NormalizedRainfall,
} from "@/lib/agriMapAdapter";
import { useTranslation } from "@/i18n";

export interface MapSidePanelProps {
    selectedState: any;
    selectedDistrict: any;
    stateSummary: any;
    districtData: any;
    selectedCrop: string;
    viewMode: string;
    onCropClick?: (crop: string) => void;
    districtsData?: Record<string, any>;
    onSelectDistrict?: (dist: any) => void;
}

export default function MapSidePanel({
    selectedState,
    selectedDistrict,
    stateSummary,
    districtData,
    selectedCrop,
    viewMode,
    onCropClick,
    districtsData = {},
    onSelectDistrict,
}: MapSidePanelProps) {
    const { t } = useTranslation();
    const [showAgriContext, setShowAgriContext] = useState(false);

    // ── Case 1: No selection → National overview
    if (!selectedState) {
        return (
            <aside className="agri-side-panel">
                <div className="agri-panel-header">
                    <div className="agri-panel-subtitle">{t("map.sidePanel.digitalAtlas")}</div>
                    <div className="agri-panel-title">{t("map.sidePanel.exploreIndia")}</div>
                    <div className="agri-panel-zone">
                        {t("map.activeMode")}: <strong className="text-cyan-400 capitalize">{viewMode.replace("-", " ")}</strong>
                    </div>
                </div>

                <div className="agri-panel-body">
                    {/* View Guide Prompt */}
                    <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-1">
                            <span className="text-cyan-400">●</span>
                            {viewMode === "rainfall" && t("map.views.rainfall")}
                            {viewMode === "warnings" && t("map.views.warnings")}
                            {viewMode === "market" && t("map.views.market")}
                            {viewMode === "soil" && t("map.views.soil")}
                            {viewMode === "overview" && t("map.views.overview")}
                        </div>
                        <p className="text-slate-400 leading-relaxed">
                            {viewMode === "rainfall" && t("map.sidePanel.rainfallDesc")}
                            {viewMode === "warnings" && t("map.sidePanel.warningsDesc")}
                            {viewMode === "market" && t("map.sidePanel.marketDesc")}
                            {viewMode === "soil" && t("map.sidePanel.soilDesc")}
                            {viewMode === "overview" && t("map.sidePanel.overviewDesc")}
                        </p>
                    </div>

                    {/* Data Coverage Checklist */}
                    <div className="agri-section">
                        <div className="agri-section-label">{t("map.sidePanel.verifiedCoverage")}</div>
                        <div className="space-y-1.5 text-xs">
                            <div className="flex items-center justify-between p-2 rounded bg-slate-900/40 border border-slate-800/60">
                                <span className="text-slate-300">🌾 {t("map.sidePanel.recordedCrops")}</span>
                                <span className="font-semibold text-emerald-400">{t("map.sidePanel.cropCatalogCount")}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-slate-900/40 border border-slate-800/60">
                                <span className="text-slate-300">🌧 {t("map.rainfall.bulletin")}</span>
                                <span className="font-semibold text-emerald-400">{t("map.sidePanel.rainfallBulletinsCount")}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-slate-900/40 border border-slate-800/60">
                                <span className="text-slate-300">⚠️ {t("map.warnings.title")}</span>
                                <span className="font-semibold text-emerald-400">{t("map.sidePanel.weatherWarningsCount")}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-slate-900/40 border border-slate-800/60">
                                <span className="text-slate-300">💰 {t("map.market.title")}</span>
                                <span className="font-semibold text-emerald-400">{t("map.sidePanel.marketReportsCount")}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-slate-900/40 border border-slate-800/60">
                                <span className="text-slate-300">🧪 {t("map.soil.title")}</span>
                                <span className="font-semibold text-emerald-400">{t("map.sidePanel.soilProfilesCount")}</span>
                            </div>
                            <div className="flex items-center justify-between p-2 rounded bg-slate-900/40 border border-slate-800/60">
                                <span className="text-slate-300">📚 {t("map.advisories")}</span>
                                <span className="font-semibold text-emerald-400">{t("map.sidePanel.advisoriesCount")}</span>
                            </div>
                        </div>
                    </div>

                    <div className="agri-provenance-box">
                        <strong>{t("map.provenance")}:</strong> {t("map.sidePanel.sourceProvenance")}
                    </div>
                </div>
            </aside>
        );
    }

    // ── Case 2: District selected
    if (selectedDistrict) {
        const d = districtData || selectedDistrict;
        const rf = normalizeRainfall(d.rainfall);
        const ww = normalizeWeatherWarning(d.weather_warning);
        const mkt = normalizeMarket(d.market);
        const soil = normalizeSoil(d.soil);
        const adv = d.advisories;
        const cal = d.crop_calendar;

        return (
            <aside className="agri-side-panel">
                <div className="agri-panel-header">
                    <div className="agri-panel-subtitle">{d.state_name}</div>
                    <div className="agri-panel-title">{d.district_name}</div>
                    <div className="agri-panel-zone">{d.agro_climatic_zone || "District Agricultural Profile"}</div>
                </div>

                <div className="agri-panel-body">
                    {/* ═════════════════════════════════════════════════════                    {/* 1. RAINFALL VIEW */}
                    {viewMode === "rainfall" && (
                        <div className="agri-section">
                            <div className="agri-section-label">
                                <span className="flex items-center gap-1.5 text-cyan-400">
                                    <CloudRain className="w-4 h-4 text-blue-400" />
                                    {t("map.rainfall.bulletin")}
                                </span>
                                {rf.hasData && (
                                    <span className="text-[10px] font-mono text-slate-400">
                                        {rf.bulletinDate || "09 Sep 2026"}
                                    </span>
                                )}
                            </div>

                            {rf.hasData ? (
                                <div className="agri-metric-card border-blue-900/40 bg-blue-950/20">
                                    <div className="flex items-baseline justify-between mb-1">
                                        <div>
                                            <div className="text-[10px] uppercase tracking-wider text-slate-400">{t("map.rainfall.actualRain")}</div>
                                            <div className="text-2xl font-bold text-slate-100">
                                                {rf.actualMm !== null ? `${rf.actualMm.toFixed(1)} mm` : t("common.na")}
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="text-[10px] uppercase tracking-wider text-slate-400">{t("map.rainfall.normalLpa")}</div>
                                            <div className="text-sm font-semibold text-slate-300">
                                                {rf.normalMm !== null ? `${rf.normalMm.toFixed(1)} mm` : t("common.na")}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Departure Badge */}
                                    <div className="flex items-center justify-between py-1 border-t border-slate-800/80 my-1">
                                        <span className="text-xs text-slate-300">{t("map.rainfall.departure")}:</span>
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                            rf.category === "Large Excess" ? "bg-blue-900/70 text-blue-300 border border-blue-700" :
                                            rf.category === "Excess" ? "bg-sky-900/70 text-sky-300 border border-sky-700" :
                                            rf.category === "Normal" ? "bg-emerald-900/70 text-emerald-300 border border-emerald-700" :
                                            rf.category === "Deficient" ? "bg-amber-900/70 text-amber-300 border border-amber-700" :
                                            "bg-red-900/70 text-red-300 border border-red-700"
                                        }`}>
                                            {rf.departurePct !== null && rf.departurePct > 0 ? "+" : ""}
                                            {rf.departurePct !== null ? `${rf.departurePct}%` : ""} {rf.category}
                                            {rf.isGenuineZero ? ` (${t("map.rainfall.noRain")})` : ""}
                                        </span>
                                    </div>

                                    {/* Departure Progress Meter */}
                                    {rf.normalMm && rf.normalMm > 0 && (
                                        <div className="w-full bg-slate-800/80 rounded-full h-1.5 overflow-hidden my-1">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${
                                                    rf.category === "Large Excess" || rf.category === "Excess" ? "bg-blue-500" :
                                                    rf.category === "Normal" ? "bg-emerald-500" :
                                                    rf.category === "Deficient" ? "bg-amber-500" : "bg-red-500"
                                                }`}
                                                style={{
                                                    width: `${Math.min(100, Math.max(5, ((rf.actualMm || 0) / rf.normalMm) * 50))}%`
                                                }}
                                            />
                                        </div>
                                    )}

                                    <div className="text-[11px] text-slate-400 mt-1">
                                        {t("map.rainfall.period")}: <span className="text-slate-300 font-medium">{rf.periodLabel}</span>
                                    </div>

                                    <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                        <span>{t("map.rainfall.bulletin")}: {rf.bulletinDate}</span>
                                        <span>{rf.source}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
                                    <CloudRain className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                                    <div className="text-xs font-semibold text-slate-300">{t("map.rainfall.noDataTitle")}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                                        {t("map.rainfall.noDataDesc")}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. WEATHER WARNINGS VIEW */}
                    {viewMode === "warnings" && (
                        <div className="agri-section">
                            <div className="agri-section-label">
                                <span className="flex items-center gap-1.5 text-cyan-400">
                                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                                    {t("map.warnings.title")}
                                </span>
                            </div>

                            {ww.hasData ? (
                                <div className="agri-metric-card">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                                            ww.colorCode === "Red" ? "bg-red-950/90 text-red-300 border border-red-700" :
                                            ww.colorCode === "Orange" ? "bg-orange-950/90 text-orange-300 border border-orange-700" :
                                            ww.colorCode === "Yellow" ? "bg-amber-950/90 text-amber-300 border border-amber-700" :
                                            "bg-emerald-950/90 text-emerald-300 border border-emerald-700"
                                        }`}>
                                            {ww.alertLevel} ({ww.colorCode})
                                        </span>
                                    </div>

                                    <div className="text-xs font-semibold text-slate-200 mb-1">
                                        {ww.hazard}
                                    </div>

                                    <div className="text-[11px] text-slate-400">
                                        {t("map.warnings.validity")}: <span className="text-slate-300">{ww.validToday}</span>
                                    </div>

                                    <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                        <span>Daily District Bulletin</span>
                                        <span>{ww.source}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
                                    <AlertTriangle className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                                    <div className="text-xs font-semibold text-slate-300">{t("map.warnings.noDataTitle")}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                        {t("map.warnings.noDataDesc")}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. MARKET VIEW */}
                    {viewMode === "market" && (
                        <div className="agri-section">
                            <div className="agri-section-label">
                                <span className="flex items-center gap-1.5 text-cyan-400">
                                    <Coins className="w-4 h-4 text-emerald-400" />
                                    {t("map.market.title")}
                                </span>
                                {mkt.hasData && (
                                    <span className="text-[10px] font-mono text-slate-400">
                                        {t("map.sidePanel.recordsCount", { count: mkt.count })}
                                    </span>
                                )}
                            </div>

                            {mkt.hasData && mkt.commodities.length > 0 ? (
                                <div className="agri-metric-card">
                                    <div className="space-y-1.5">
                                        {mkt.commodities.map((c, i) => (
                                            <div key={i} className="flex justify-between items-center py-1 border-b border-slate-800/60 last:border-b-0">
                                                <div>
                                                    <div className="text-xs font-semibold text-slate-200">{c.commodity}</div>
                                                    <div className="text-[10px] text-slate-400">{c.market}</div>
                                                </div>
                                                <span className="font-bold text-xs text-emerald-400">
                                                    {c.modalPrice ? `₹${c.modalPrice.toLocaleString()}/q` : "Reported"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                        <span>APMC Wholesale Arrivals</span>
                                        <span>{mkt.source}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
                                    <Coins className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                                    <div className="text-xs font-semibold text-slate-300">{t("map.market.noDataTitle")}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                        {t("map.market.noDataDesc")}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 4. SOIL VIEW */}
                    {viewMode === "soil" && (
                        <div className="agri-section">
                            <div className="agri-section-label">
                                <span className="flex items-center gap-1.5 text-cyan-400">
                                    <FlaskConical className="w-4 h-4 text-lime-400" />
                                    {t("map.soil.title")}
                                </span>
                            </div>

                            {soil.hasData ? (
                                <div className="agri-metric-card">
                                    <div className="font-semibold text-xs text-slate-200 mb-1">{soil.soilType}</div>
                                    <div className="text-[11px] text-slate-400">
                                        pH: <strong className="text-slate-300">{soil.phRange}</strong> · {t("map.soil.oc")}: <strong className="text-slate-300">{soil.organicCarbon}</strong>
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                        N: <strong className="text-slate-300">{soil.nitrogenStatus}</strong> · P: <strong className="text-slate-300">{soil.phosphorusStatus}</strong> · K: <strong className="text-slate-300">{soil.potassiumStatus}</strong>
                                    </div>
                                    <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                        <span>Laboratory Baseline</span>
                                        <span>{soil.source}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3.5 rounded-lg bg-slate-900/40 border border-slate-800 text-center">
                                    <FlaskConical className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                                    <div className="text-xs font-semibold text-slate-300">{t("map.soil.noDataTitle")}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                        {t("map.soil.noDataDesc")}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 5. OVERVIEW VIEW */}
                    {viewMode === "overview" && (
                        <>
                            {/* Crops */}
                            <div className="agri-section">
                                <div className="agri-section-label">
                                    <span>🌾 {t("map.sidePanel.recordedCrops")} ({d.recorded_crops?.length || 0})</span>
                                </div>
                                {d.recorded_crops && d.recorded_crops.length > 0 ? (
                                    <div className="agri-chips-wrap max-h-32 overflow-y-auto pr-1">
                                        {d.recorded_crops.map((crop: string) => (
                                            <button
                                                key={crop}
                                                type="button"
                                                className={`agri-crop-chip ${selectedCrop === crop ? "active" : ""}`}
                                                onClick={() => onCropClick && onCropClick(crop)}
                                                title={`Filter map by ${crop}`}
                                            >
                                                {crop}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                                        {t("map.sidePanel.noCropsRecorded")}
                                    </div>
                                )}
                            </div>

                            {/* Summary cards for overview */}
                            <div className="agri-section">
                                <div className="agri-section-label">{t("map.sidePanel.keyDistrictMetrics")}</div>
                                <div className="space-y-1.5">
                                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800 text-xs flex justify-between items-center">
                                        <span className="text-slate-300 flex items-center gap-1.5">
                                            <CloudRain className="w-3.5 h-3.5 text-blue-400" /> {t("map.views.rainfall")}
                                        </span>
                                        <span className="font-semibold text-slate-200">
                                            {rf.hasData ? `${rf.actualMm} mm (${rf.category})` : t("common.noData")}
                                        </span>
                                    </div>
                                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800 text-xs flex justify-between items-center">
                                        <span className="text-slate-300 flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> {t("map.views.warnings")}
                                        </span>
                                        <span className="font-semibold text-slate-200">
                                            {ww.hasData ? ww.alertLevel : t("common.noData")}
                                        </span>
                                    </div>
                                    <div className="p-2 rounded bg-slate-900/40 border border-slate-800 text-xs flex justify-between items-center">
                                        <span className="text-slate-300 flex items-center gap-1.5">
                                            <Coins className="w-3.5 h-3.5 text-emerald-400" /> {t("map.market.title")}
                                        </span>
                                        <span className="font-semibold text-slate-200">
                                            {mkt.hasData ? t("map.sidePanel.recordsCount", { count: mkt.count }) : t("common.noData")}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ══════════════════════════════════════════════════════
                        SECONDARY: AGRONOMIC CONTEXT (when not in overview)
                        ══════════════════════════════════════════════════════ */}
                    {viewMode !== "overview" && (
                        <div className="agri-section border-t border-slate-800/80 pt-2.5">
                            <button
                                type="button"
                                className="w-full flex justify-between items-center text-xs font-semibold text-slate-400 hover:text-slate-200 py-1"
                                onClick={() => setShowAgriContext((prev) => !prev)}
                            >
                                <span className="flex items-center gap-1.5">
                                    <Sprout className="w-3.5 h-3.5 text-emerald-400" />
                                    {t("map.sidePanel.agronomicContext")} ({d.recorded_crops?.length || 0} {t("map.crops")})
                                </span>
                                {showAgriContext ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>

                            {showAgriContext && (
                                <div className="mt-2">
                                    {d.recorded_crops && d.recorded_crops.length > 0 ? (
                                        <div className="agri-chips-wrap max-h-32 overflow-y-auto pr-1">
                                            {d.recorded_crops.map((crop: string) => (
                                                <button
                                                    key={crop}
                                                    type="button"
                                                    className={`agri-crop-chip ${selectedCrop === crop ? "active" : ""}`}
                                                    onClick={() => onCropClick && onCropClick(crop)}
                                                    title={`Filter map by ${crop}`}
                                                >
                                                    {crop}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-slate-500">
                                            No crop records available for this district.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="agri-provenance-box">
                        <strong>Source Provenance:</strong> IMD Daily Bulletins, Agmarknet Mandi API, ICAR & State Agricultural Universities.
                    </div>
                </div>
            </aside>
        );
    }

    // ── Case 3: State selected (no district)
    const info = stateSummary?.available_info || {};

    return (
        <aside className="agri-side-panel">
            <div className="agri-panel-header">
                <div className="agri-panel-subtitle">{t("map.sidePanel.stateOverview")}</div>
                <div className="agri-panel-title">{selectedState.state_name}</div>
                <div className="agri-panel-zone">
                    {selectedState.zone} · {selectedState.total_districts || stateSummary?.total_districts || 0} {t("map.districts")}
                </div>
            </div>

            <div className="agri-panel-body">
                {/* View-specific state cards */}
                {viewMode === "rainfall" && (
                    <div className="agri-section">
                        <div className="agri-section-label">🌧 {t("map.rainfall.stateStatus")}</div>
                        <div className="agri-metric-card border-blue-900/40 bg-blue-950/20">
                            <div className="text-lg font-bold text-slate-100 mb-1">
                                {stateSummary?.rainfall_status || t("common.noData")}
                            </div>
                            <div className="text-xs text-slate-400">
                                {t("map.rainfall.activeReporting", { count: info.rainfall?.district_count || 0 })}
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                <span>{t("map.rainfall.subdivisionDaily")}</span>
                                <span>{info.rainfall?.source || "IMD"}</span>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === "warnings" && (
                    <div className="agri-section">
                        <div className="agri-section-label">⚠️ {t("map.warnings.stateWarningLevel")}</div>
                        <div className="agri-metric-card">
                            <div className="text-lg font-bold text-slate-100 mb-1">
                                {stateSummary?.warning_color || "Green"}
                            </div>
                            <div className="text-xs text-slate-400">
                                {t("map.warnings.monitored", { count: info.weather_warning?.district_count || 0 })}
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                <span>Regional Meteorological Centre</span>
                                <span>{info.weather_warning?.source || "IMD"}</span>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === "market" && (
                    <div className="agri-section">
                        <div className="agri-section-label">💰 {t("map.market.stateCoverage")}</div>
                        <div className="agri-metric-card">
                            <div className="text-lg font-bold text-slate-100 mb-1">
                                {info.market_prices?.available ? t("map.market.commoditiesCount", { count: info.market_prices.commodity_count }) : t("map.market.noDataTitle")}
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                <span>Agmarknet Mandi Network</span>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === "soil" && (
                    <div className="agri-section">
                        <div className="agri-section-label">🧪 {t("map.soil.stateBaseline")}</div>
                        <div className="agri-metric-card">
                            <div className="text-lg font-bold text-slate-100 mb-1">
                                {info.soil_observations?.available ? t("map.soil.districtsCovered", { count: info.soil_observations.records_count }) : t("map.soil.noDataTitle")}
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500 mt-2 border-t border-slate-800/80 pt-1">
                                <span>Soil Health System</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Crops in this state */}
                <div className="agri-section">
                    <div className="agri-section-label">
                        <span>🌾 {t("map.crops")} ({stateSummary?.crops_count || selectedState.crops_count || 0})</span>
                    </div>
                    {stateSummary?.recorded_crops && stateSummary.recorded_crops.length > 0 ? (
                        <div className="agri-chips-wrap max-h-36 overflow-y-auto pr-1">
                            {stateSummary.recorded_crops.map((crop: string) => (
                                <button
                                    key={crop}
                                    type="button"
                                    className={`agri-crop-chip ${selectedCrop === crop ? "active" : ""}`}
                                    onClick={() => onCropClick && onCropClick(crop)}
                                    title={`Filter map by ${crop}`}
                                >
                                    {crop}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                            {t("map.sidePanel.noCropsState")}
                        </div>
                    )}
                </div>

                {/* District Quick Selector */}
                <div className="agri-section">
                    <div className="agri-section-label">
                        <span>📍 {t("map.sidePanel.selectDistrict")} ({Object.keys(districtsData).length || selectedState.total_districts || 0})</span>
                    </div>
                    {Object.keys(districtsData).length > 0 ? (
                        <div className="agri-chips-wrap max-h-44 overflow-y-auto pr-1">
                            {Object.values(districtsData)
                                .sort((a: any, b: any) => (a.district_name || "").localeCompare(b.district_name || ""))
                                .map((dist: any) => (
                                    <button
                                        key={dist.geo_id}
                                        type="button"
                                        className="agri-crop-chip"
                                        onClick={() => onSelectDistrict && onSelectDistrict(dist)}
                                        title={`Explore ${dist.district_name}`}
                                    >
                                        {dist.district_name}
                                    </button>
                                ))}
                        </div>
                    ) : (
                        <div className="p-2.5 rounded bg-slate-900/40 border border-slate-800 text-xs text-slate-400">
                            {t("map.sidePanel.clickDistrictMap")}
                        </div>
                    )}
                </div>

                <div className="agri-provenance-box">
                    <strong>{t("map.provenance")}:</strong> {t("map.sidePanel.sourceProvenance")}
                </div>
            </div>
        </aside>
    );
}
