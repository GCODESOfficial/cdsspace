"use client";

import { useState, useEffect } from "react";
import { Map, Marker, NavigationControl } from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { motion, AnimatePresence } from "framer-motion";
import { Navigation, Copy, AlertCircle } from "lucide-react";
import Image from "next/image";

const CDS_COORDS = {
    latitude: 5.00593,
    longitude: 7.94664
};

const INITIAL_VIEW_STATE = {
    ...CDS_COORDS,
    zoom: 15,
    pitch: 45,
    bearing: 0
};

export const MapSection = () => {
    const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
    const [copied, setCopied] = useState(false);
    const [mapLoaded, setMapLoaded] = useState(false);

    const mapStyle = "mapbox://styles/mapbox/dark-v11";

    const copyCoords = () => {
        navigator.clipboard.writeText(`${CDS_COORDS.latitude}, ${CDS_COORDS.longitude}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleGetDirections = () => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${CDS_COORDS.latitude},${CDS_COORDS.longitude}`;
        window.open(url, "_blank");
    };

    return (
        <section className="w-full h-[560px] sm:h-[600px] md:h-[840px] relative group">
            <div className="max-w-[1408px] mx-auto h-full px-4 sm:px-6 relative">
                <div className="w-full h-full rounded-[40px] overflow-hidden border border-brand-stroke-ii shadow-2xl relative">

                    {/* MAPBOX ENGINE */}
                    <Map
                        {...viewState}
                        onMove={evt => setViewState(evt.viewState)}
                        onLoad={() => setMapLoaded(true)}
                        mapLib={mapboxgl}
                        mapStyle={mapStyle}
                        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "pk.eyJ1IjoiYWRhbXBsIiwiYSI6ImNtN2V3bjdzYzBicGMybW4xYjUyeTNreTIifQ._E5664rS8Wl5qM2Y7f_q0g"}
                        maxZoom={18}
                        minZoom={12}
                        attributionControl={false}
                    >
                        {/* 
                            CRITICAL FIX: 
                            TypeError: Cannot read properties of undefined (reading 'appendChild')
                            Happens when Marker tries to mount before the Map instance is fully ready in the DOM.
                            We wrap Marker in mapLoaded state and ensure mapLib is explicitly passed.
                        */}
                        {mapLoaded && (
                            <Marker
                                latitude={CDS_COORDS.latitude}
                                longitude={CDS_COORDS.longitude}
                                anchor="center"
                            >
                                <div className="relative group/marker cursor-pointer">
                                    <div className="absolute inset-0 bg-brand-blue/30 rounded-full animate-ping scale-150" />
                                    <div className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center relative z-10 p-2.5 transition-transform duration-300 group-hover/marker:scale-110">
                                        <Image
                                            src="/navbar/CDS Logo.svg"
                                            alt="CDS"
                                            width={32}
                                            height={12}
                                            className="object-contain"
                                        />
                                    </div>
                                </div>
                            </Marker>
                        )}

                        <div className="absolute bottom-10 right-10">
                            <NavigationControl showCompass={false} />
                        </div>
                    </Map>

                    {/* FLOATING LOCATION CARD */}
                    <AnimatePresence>
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="absolute bottom-4 left-4 right-4 md:bottom-8 md:left-8 md:right-auto md:w-[420px] bg-[#1E1E1E]/90 backdrop-blur-xl border border-white/10 rounded-[24px] md:rounded-[32px] p-4 sm:p-5 md:p-6 text-white shadow-2xl overflow-hidden"
                        >
                            <div className="flex items-center justify-between mb-5 md:mb-6 gap-3">
                                <div>
                                    <h3 className="text-lg md:text-xl font-bold tracking-tight">My Location</h3>
                                    <p className="text-sm text-white/40">Near General Edet Akpan Avenue</p>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center cursor-pointer hover:bg-white/10 transition-colors">
                                    <AlertCircle size={18} className="text-white/60" />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white/5 rounded-2xl p-4 relative group/addr">
                                    <p className="text-xs text-white/30 uppercase font-bold tracking-widest mb-2">Details</p>
                                    <div className="flex items-start justify-between">
                                        <div className="text-sm space-y-1 font-medium min-w-0">
                                            <p className="text-white">General Edet Akpan Avenue</p>
                                            <p className="text-white/60">Uyo</p>
                                            <p className="text-white/60">Akwa Ibom</p>
                                            <p className="text-white/60">Nigeria</p>
                                        </div>
                                        <button
                                            onClick={handleGetDirections}
                                            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-brand-blue flex items-center justify-center shadow-lg hover:scale-110 transition-transform cursor-pointer shrink-0"
                                        >
                                            <Navigation size={20} className="text-white" fill="white" />
                                        </button>
                                    </div>

                                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] text-white/30 uppercase font-bold tracking-widest leading-none mb-1">Coordinates</p>
                                            <p className="text-sm font-bold text-brand-blue">5.00593° N, 7.94664° E</p>
                                        </div>
                                        <button
                                            onClick={copyCoords}
                                            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                                        >
                                            {copied ? "Copied!" : <><Copy size={12} /> Copy</>}
                                        </button>
                                    </div>
                                </div>

                                <button className="w-full flex items-center justify-center gap-2 py-4 text-xs font-bold uppercase tracking-widest text-brand-blue/80 hover:text-brand-blue bg-brand-blue/5 hover:bg-brand-blue/10 rounded-2xl transition-all">
                                    <AlertCircle size={14} />
                                    Report Something Missing
                                </button>
                            </div>

                            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-brand-blue/20 blur-[60px] rounded-full pointer-events-none" />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
};
