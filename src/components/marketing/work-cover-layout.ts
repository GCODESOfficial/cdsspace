export type WorkCoverShape = {
    width: number;
    height: number;
    ratio: number;
    kind: "wide" | "landscape" | "square" | "portrait";
};

const DEFAULT_GRID_ROW_HEIGHT = 1;
const DEFAULT_GRID_GAP = 16;
const FALLBACK_RATIO = 16 / 10;
const DEFAULT_MIN_ROW_SPAN = 10;

export function getWorkCoverShape(width: number, height: number): WorkCoverShape | null {
    if (!width || !height) return null;

    const ratio = width / height;
    return {
        width,
        height,
        ratio,
        kind: ratio >= 1.55 ? "wide" : ratio >= 1.16 ? "landscape" : ratio >= 0.88 ? "square" : "portrait",
    };
}

export function getWorkMosaicClass(shape?: WorkCoverShape | null) {
    if (shape?.kind === "wide") return "md:col-span-2";
    return "";
}

export function getWorkMosaicRowSpan(
    width: number,
    shape?: WorkCoverShape | null,
    options: { gap?: number; minRowSpan?: number; rowHeight?: number } = {},
) {
    const gap = options.gap ?? DEFAULT_GRID_GAP;
    const rowHeight = options.rowHeight ?? DEFAULT_GRID_ROW_HEIGHT;
    const minRowSpan = options.minRowSpan ?? DEFAULT_MIN_ROW_SPAN;
    const ratio = shape?.ratio ?? FALLBACK_RATIO;
    const targetHeight = width > 0 ? width / ratio : 220;
    const rowSpan = Math.ceil((targetHeight + gap) / (rowHeight + gap));

    return Math.max(minRowSpan, rowSpan);
}

export function measureImage(url: string): Promise<WorkCoverShape | null> {
    if (typeof window === "undefined") return Promise.resolve(null);

    return new Promise((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve(getWorkCoverShape(img.naturalWidth, img.naturalHeight));
        img.onerror = () => resolve(null);
        img.src = url;
    });
}
