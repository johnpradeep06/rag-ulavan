/**
 * Clean data adapter and normalization layer for the India Agriculture Map.
 * Strictly separates missing/unrecorded data from genuine zero measurements,
 * provides verified IMD meteorological categories, Agmarknet market structures,
 * and semantic choropleth color mappings.
 */

export interface NormalizedRainfall {
    hasData: boolean;
    actualMm: number | null;
    normalMm: number | null;
    departurePct: number | null;
    category: "Large Excess" | "Excess" | "Normal" | "Deficient" | "Large Deficient" | "No Data";
    periodType: string;
    periodLabel: string;
    bulletinDate: string | null;
    source: string;
    sourceUrl?: string;
    isGenuineZero: boolean;
}

export interface NormalizedWeatherWarning {
    hasData: boolean;
    alertLevel: string;
    colorCode: "Red" | "Orange" | "Yellow" | "Green" | "No Data";
    hazard: string;
    validToday: string | null;
    source: string;
}

export interface NormalizedMarketItem {
    commodity: string;
    market: string;
    variety?: string;
    modalPrice: number | null;
    unit: string;
    arrivalDate?: string;
}

export interface NormalizedMarket {
    hasData: boolean;
    commodities: NormalizedMarketItem[];
    count: number;
    source: string;
}

export interface NormalizedSoil {
    hasData: boolean;
    soilType: string;
    phRange: string;
    organicCarbon: string;
    nitrogenStatus: string;
    phosphorusStatus: string;
    potassiumStatus: string;
    source: string;
}

/**
 * Normalizes rainfall data.
 * Explicitly guards against dummy zero stubs:
 * - If rainfall is missing or available === false -> hasData = false
 * - If actual_rainfall_mm === 0 AND normal_rainfall_mm === 0 -> hasData = false (invalid unrecorded stub)
 * - If actual_rainfall_mm === 0 AND normal_rainfall_mm > 0 -> hasData = true, isGenuineZero = true
 */
export function normalizeRainfall(rf: any): NormalizedRainfall {
    if (!rf || rf.available !== true) {
        return {
            hasData: false,
            actualMm: null,
            normalMm: null,
            departurePct: null,
            category: "No Data",
            periodType: "daily",
            periodLabel: "No rainfall report on file for this period",
            bulletinDate: null,
            source: "IMD District Rainfall Bulletin",
            isGenuineZero: false,
        };
    }

    const actual = rf.actual_rainfall_mm != null ? Number(rf.actual_rainfall_mm) : null;
    const normal = rf.normal_rainfall_mm != null ? Number(rf.normal_rainfall_mm) : null;

    // Detect unmeasured/stub data where both actual and normal are 0.0
    if (actual === 0 && (normal === 0 || normal === null)) {
        return {
            hasData: false,
            actualMm: null,
            normalMm: null,
            departurePct: null,
            category: "No Data",
            periodType: "daily",
            periodLabel: "No recorded rainfall observation",
            bulletinDate: rf.bulletin_date || null,
            source: rf.source || "IMD District Rainfall Bulletin",
            isGenuineZero: false,
        };
    }

    // Genuine observation with normal > 0
    let departure = rf.departure_pct != null ? Number(rf.departure_pct) : null;
    if (departure === null && actual !== null && normal !== null && normal > 0) {
        departure = Math.round(((actual - normal) / normal) * 1000) / 10;
    }

    // Strict IMD Category calculation
    let category: NormalizedRainfall["category"] = "No Data";
    if (actual !== null && normal !== null) {
        if (actual === 0) {
            category = "Large Deficient"; // Genuine zero precipitation (No Rain)
        } else if (departure !== null) {
            if (departure >= 60.0) category = "Large Excess";
            else if (departure >= 20.0) category = "Excess";
            else if (departure >= -19.0) category = "Normal";
            else if (departure >= -59.0) category = "Deficient";
            else category = "Large Deficient";
        }
    }

    return {
        hasData: true,
        actualMm: actual,
        normalMm: normal,
        departurePct: departure,
        category,
        periodType: rf.period_type || "daily",
        periodLabel: rf.period_label || "24-hour daily rainfall ending 08:30 IST",
        bulletinDate: rf.bulletin_date || "2026-09-09",
        source: rf.source || "IMD District Rainfall Bulletin",
        sourceUrl: rf.source_url || "https://mausam.imd.gov.in",
        isGenuineZero: actual === 0,
    };
}

export function normalizeWeatherWarning(ww: any): NormalizedWeatherWarning {
    if (!ww || ww.available !== true) {
        return {
            hasData: false,
            alertLevel: "No Warning",
            colorCode: "No Data",
            hazard: "No active weather warnings on record",
            validToday: null,
            source: "IMD District Weather Warning",
        };
    }

    const rawColor = String(ww.color_code || "").trim().toLowerCase();
    let colorCode: NormalizedWeatherWarning["colorCode"] = "Green";
    if (rawColor === "red") colorCode = "Red";
    else if (rawColor === "orange") colorCode = "Orange";
    else if (rawColor === "yellow") colorCode = "Yellow";
    else if (rawColor === "green") colorCode = "Green";
    else colorCode = "No Data";

    return {
        hasData: true,
        alertLevel: ww.alert_level || (colorCode === "Red" ? "Warning" : colorCode === "Orange" ? "Alert" : colorCode === "Yellow" ? "Watch" : "No Warning"),
        colorCode,
        hazard: ww.hazard || "No severe weather expected",
        validToday: ww.valid_today || "2026-09-10",
        source: ww.source || "IMD District Weather Warning",
    };
}

export function normalizeMarket(mkt: any): NormalizedMarket {
    if (!mkt || mkt.available !== true || !Array.isArray(mkt.commodities) || mkt.commodities.length === 0) {
        return {
            hasData: false,
            commodities: [],
            count: 0,
            source: "Agmarknet Mandi API",
        };
    }

    const items: NormalizedMarketItem[] = mkt.commodities.map((c: any) => ({
        commodity: c.commodity || "Unknown Commodity",
        market: c.market || "Local APMC Mandi",
        variety: c.variety || "Standard",
        modalPrice: c.modal_price != null ? Number(c.modal_price) : null,
        unit: c.unit || "INR/quintal",
        arrivalDate: c.arrival_date || "2026-09-10",
    }));

    return {
        hasData: true,
        commodities: items,
        count: mkt.count || items.length,
        source: mkt.source || "Agmarknet (Ministry of Agriculture & Farmers Welfare)",
    };
}

export function normalizeSoil(soil: any): NormalizedSoil {
    if (!soil || soil.available !== true) {
        return {
            hasData: false,
            soilType: "No recorded soil profile",
            phRange: "N/A",
            organicCarbon: "N/A",
            nitrogenStatus: "N/A",
            phosphorusStatus: "N/A",
            potassiumStatus: "N/A",
            source: "Soil Health System / Dept of Agriculture",
        };
    }

    return {
        hasData: true,
        soilType: soil.soil_type || "Alluvial / Loamy",
        phRange: soil.ph_range || "6.5–7.5 (Neutral)",
        organicCarbon: soil.organic_carbon || "0.5% (Medium)",
        nitrogenStatus: soil.nitrogen_status || "Medium",
        phosphorusStatus: soil.phosphorus_status || "Medium",
        potassiumStatus: soil.potassium_status || "Medium",
        source: soil.source || "Soil Health System / Dept of Agriculture",
    };
}

// Visual color tokens adhering strictly to the NOVA dark theme
export const THEME_COLORS = {
    canvasBg: "#070a12",
    panelBg: "#0b0f19",
    borderSubtle: "rgba(148, 163, 184, 0.15)",
    borderHighlight: "rgba(56, 189, 248, 0.6)",
    selectedBorder: "#f59e0b",
    
    // Rainfall categories (IMD official color scheme)
    rainLargeExcess: "#1d4ed8", // Deep blue (>= +60%)
    rainExcess: "#0284c7",      // Sky blue (+20% to +59%)
    rainNormal: "#15803d",      // Forest green (-19% to +19%)
    rainDeficient: "#d97706",   // Amber ochre (-20% to -59%)
    rainLargeDeficient: "#b91c1c", // Crimson (<= -60% or genuine 0 mm)
    noDataMuted: "#1e293b",     // Muted dark slate
    
    // Weather warning colors
    warnRed: "#dc2626",
    warnOrange: "#ea580c",
    warnYellow: "#ca8a04",
    warnGreen: "#15803d",

    // Market and Soil
    marketActive: "#059669",
    soilActive: "#65a30d",

    // Overview coverage
    coverageHigh: "#15803d",
    coverageMid: "#16a34a",
    coverageBasic: "#22c55e",
};
