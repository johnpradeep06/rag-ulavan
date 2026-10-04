"use client";

import React from "react";
import { THEME_COLORS } from "@/lib/agriMapAdapter";
import { useTranslation } from "@/i18n";

interface MapLegendProps {
    selectedCrop: string;
    viewMode: string;
    hasSelectedState: boolean;
}

export default function MapLegend({ selectedCrop, viewMode, hasSelectedState }: MapLegendProps) {
    const { t } = useTranslation();
    // 1. Rainfall View
    if (viewMode === "rainfall") {
        return (
            <div className="agri-legend-card">
                <div className="agri-legend-header">
                    <span className="agri-legend-title">🌧 {t("map.legend.rainfallTitle")}</span>
                    {selectedCrop && (
                        <span className="agri-legend-badge">
                            🌾 {selectedCrop} ({t("map.legend.nonProducingDimmed")})
                        </span>
                    )}
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.rainLargeExcess }} />
                    <span>{t("map.legend.largeExcess")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.rainExcess }} />
                    <span>{t("map.legend.excess")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.rainNormal }} />
                    <span>{t("map.legend.normal")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.rainDeficient }} />
                    <span>{t("map.legend.deficient")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.rainLargeDeficient }} />
                    <span>{t("map.legend.largeDeficient")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                    <span>{t("map.legend.noData")}</span>
                </div>
            </div>
        );
    }

    // 2. Weather Warnings View
    if (viewMode === "warnings") {
        return (
            <div className="agri-legend-card">
                <div className="agri-legend-header">
                    <span className="agri-legend-title">⚠️ {t("map.legend.warningsTitle")}</span>
                    {selectedCrop && (
                        <span className="agri-legend-badge">
                            🌾 {selectedCrop}
                        </span>
                    )}
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.warnRed }} />
                    <span>{t("map.legend.redAction")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.warnOrange }} />
                    <span>{t("map.legend.orangePrepared")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.warnYellow }} />
                    <span>{t("map.legend.yellowUpdated")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.warnGreen }} />
                    <span>{t("map.legend.greenNormal")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                    <span>{t("map.legend.noData")}</span>
                </div>
            </div>
        );
    }

    // 3. Market View
    if (viewMode === "market") {
        return (
            <div className="agri-legend-card">
                <div className="agri-legend-header">
                    <span className="agri-legend-title">💰 {t("map.legend.marketTitle")}</span>
                    {selectedCrop && (
                        <span className="agri-legend-badge">
                            🌾 {selectedCrop}
                        </span>
                    )}
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.marketActive }} />
                    <span>{t("map.legend.activeMandi")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                    <span>{t("map.legend.noMandi")}</span>
                </div>
            </div>
        );
    }

    // 4. Soil View
    if (viewMode === "soil") {
        return (
            <div className="agri-legend-card">
                <div className="agri-legend-header">
                    <span className="agri-legend-title">🧪 {t("map.legend.soilTitle")}</span>
                    {selectedCrop && (
                        <span className="agri-legend-badge">
                            🌾 {selectedCrop}
                        </span>
                    )}
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.soilActive }} />
                    <span>{t("map.legend.soilAvailable")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                    <span>{t("map.legend.noSoil")}</span>
                </div>
            </div>
        );
    }

    // 5. Crop Filter Mode in Overview View
    if (selectedCrop) {
        return (
            <div className="agri-legend-card">
                <div className="agri-legend-header">
                    <span className="agri-legend-title">🌾 {t("map.legend.cropTitle")}</span>
                    <span className="agri-legend-badge">{selectedCrop}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.coverageMid }} />
                    <span>{t("map.legend.recordsCultivation")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                    <span>{t("map.legend.noCultivation")}</span>
                </div>
            </div>
        );
    }

    // 6. District Overview
    if (hasSelectedState) {
        return (
            <div className="agri-legend-card">
                <div className="agri-legend-header">
                    <span className="agri-legend-title">📍 {t("map.legend.districtCompleteness")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.coverageHigh }} />
                    <span>{t("map.legend.comprehensive")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.coverageBasic }} />
                    <span>{t("map.legend.basicCoverage")}</span>
                </div>
                <div className="agri-legend-item">
                    <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                    <span>{t("map.legend.baselineOnly")}</span>
                </div>
            </div>
        );
    }

    // 7. National Overview
    return (
        <div className="agri-legend-card">
            <div className="agri-legend-header">
                <span className="agri-legend-title">🗺️ {t("map.legend.nationalCoverage")}</span>
            </div>
            <div className="agri-legend-item">
                <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.coverageHigh }} />
                <span>{t("map.legend.highCoverage")}</span>
            </div>
            <div className="agri-legend-item">
                <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.coverageMid }} />
                <span>{t("map.legend.mediumCoverage")}</span>
            </div>
            <div className="agri-legend-item">
                <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.coverageBasic }} />
                <span>{t("map.legend.basicCoverage")}</span>
            </div>
            <div className="agri-legend-item">
                <div className="agri-legend-swatch" style={{ backgroundColor: THEME_COLORS.noDataMuted }} />
                <span>{t("map.legend.baselineOnly")}</span>
            </div>
        </div>
    );
}
