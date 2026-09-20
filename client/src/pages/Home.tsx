import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bookmark,
  BriefcaseBusiness,
  CarFront,
  Check,
  ChevronDown,
  Clock3,
  Compass,
  Crosshair,
  Flag,
  Gauge,
  Heart,
  Home as HomeIcon,
  Layers3,
  Map,
  MapPin,
  Menu,
  Mic,
  Navigation,
  ParkingCircle,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";

type SavedTab = "home" | "work" | "favorites";
type ReportType = "police" | "crash" | "obstacle" | "hazard";
type Priority = "3" | "2" | "1";
type LocationStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const searchSuggestions = [
  { name: "Nearby businesses", detail: "Live places and ratings appear here", icon: ParkingCircle, accent: "amber" },
  { name: "Search for a café", detail: "Live business results and ratings", icon: Star, accent: "rose" },
  { name: "Home", detail: "Add a home address", icon: HomeIcon, accent: "blue" },
  { name: "Work", detail: "Add a work address", icon: BriefcaseBusiness, accent: "violet" },
];

const savedPlaces: Record<SavedTab, { title: string; address: string; eta: string; distance: string }> = {
  home: { title: "Home", address: "Add a home address", eta: "—", distance: "—" },
  work: { title: "Work", address: "Add a work address", eta: "—", distance: "—" },
  favorites: { title: "Favorites", address: "Save a place from search", eta: "—", distance: "—" },
};

const priorityOptions: Array<{ value: Priority; label: string; caption: string; color: string }> = [
  { value: "3", label: "Urgent", caption: "Very important meeting", color: "#ef6a60" },
  { value: "2", label: "Activity", caption: "Running late for plans", color: "#e9a446" },
  { value: "1", label: "Normal", caption: "Everyday travel", color: "#6174d8" },
];

const reportOptions: Array<{ value: ReportType; label: string; icon: typeof ShieldAlert }> = [
  { value: "police", label: "Police", icon: ShieldAlert },
  { value: "crash", label: "Crash", icon: CarFront },
  { value: "obstacle", label: "Obstacle", icon: AlertTriangle },
  { value: "hazard", label: "Road hazard", icon: Flag },
];

export default function Home() {
  const [activeNav, setActiveNav] = useState("map");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [savedTab, setSavedTab] = useState<SavedTab>("home");
  const [routeDestination, setRouteDestination] = useState("a destination");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("police");
  const [priority, setPriority] = useState<Priority>("1");
  const [reportNote, setReportNote] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);
  const [assistantNote, setAssistantNote] = useState("Try saying “Hey Gemini, take me to a café”");
  const [locationPromptOpen, setLocationPromptOpen] = useState(true);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle");
  const [mapReady, setMapReady] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const parseIntent = trpc.assistant.parseIntent.useMutation();
  const submitReport = trpc.reports.submit.useMutation();

  const filteredSuggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return searchSuggestions;
    return searchSuggestions.filter(item => `${item.name} ${item.detail}`.toLowerCase().includes(normalized));
  }, [query]);

  const activePlace = savedPlaces[savedTab];

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("unavailable");
      return;
    }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      position => {
        const center = { lat: position.coords.latitude, lng: position.coords.longitude };
        mapRef.current?.setCenter(center);
        mapRef.current?.setZoom(15);
        setLocationStatus("granted");
        setLocationPromptOpen(false);
        setAssistantNote("Location ready — search for a destination when you’re ready.");
        toast.success("Location ready");
      },
      error => setLocationStatus(error.code === 1 ? "denied" : "unavailable"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const selectDestination = (destination: string) => {
    setRouteDestination(destination);
    setQuery(destination);
    setSearchOpen(false);
    setAssistantNote(`Route preview ready for ${destination}.`);
    toast.success(`Route preview ready for ${destination}`);
  };

  const handleAssistantIntent = (transcript: string) => {
    parseIntent.mutate(
      { transcript },
      {
        onSuccess: result => {
          if (result.intent === "report") {
            setReportType(result.reportType ?? "hazard");
            setReportOpen(true);
            setAssistantNote(`I can log that ${result.reportType ?? "road hazard"} report for you.`);
            return;
          }
          if (result.destination) {
            selectDestination(result.destination);
            setAssistantNote(`Gemini found a route to ${result.destination}.`);
            return;
          }
          setAssistantNote(result.message ?? `Heard: “${transcript}”`);
        },
        onError: () => {
          const destination = transcript.replace(/take me to|navigate to|directions to/gi, "").trim();
          if (destination) selectDestination(destination);
          setAssistantNote(`Heard: “${transcript}”`);
        },
      },
    );
  };

  const handleVoice = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("Voice commands need a browser with speech recognition enabled.");
      setAssistantNote("Voice input is not available in this browser.");
      return;
    }
    if (voiceActive) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setVoiceActive(true);
    recognition.onend = () => setVoiceActive(false);
    recognition.onerror = event => {
      setVoiceActive(false);
      toast.error(`Voice input stopped: ${event.error}`);
    };
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) {
        setAssistantNote(`Listening: “${transcript}”`);
        handleAssistantIntent(transcript);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const submitDriverReport = () => {
    submitReport.mutate(
      { type: reportType, priority, note: reportNote || undefined, location: "Current map location" },
      {
        onSuccess: () => {
          setReportOpen(false);
          setReportNote("");
          toast.success("Report shared with nearby drivers");
          setAssistantNote("Thanks — nearby drivers will see this in real time.");
        },
        onError: () => toast.error("Could not share the report yet"),
      },
    );
  };

  return (
    <div className="motion-app">
      <aside className="side-rail">
        <div className="brand-mark" aria-label="Motion home">
          <Navigation size={19} strokeWidth={2.5} />
        </div>
        <div className="side-rail__stack">
          {[
            { id: "map", label: "Map", icon: Map },
            { id: "recent", label: "Recent", icon: Clock3 },
            { id: "saved", label: "Saved", icon: Bookmark },
          ].map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`rail-button ${activeNav === item.id ? "is-active" : ""}`}
                onClick={() => {
                  setActiveNav(item.id);
                  if (item.id !== "map") toast.info(`${item.label} view is coming next`);
                }}
                aria-label={item.label}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="side-rail__bottom">
          <button type="button" className="rail-button" onClick={() => toast.info("Settings are coming next")} aria-label="Settings">
            <SlidersHorizontal size={19} />
            <span>Settings</span>
          </button>
          <div className="profile-chip" aria-label="Your profile">
            You
          </div>
        </div>
      </aside>

      <main className="app-main">
        <header className="topbar">
          <div className="topbar__left">
            <button className="mobile-menu" type="button" aria-label="Open menu" onClick={() => toast.info("Swipe up to reveal more tools") }>
              <Menu size={19} />
            </button>
            <div>
              <p className="eyebrow">Saturday, September 21</p>
              <h1>Good morning<span className="period">.</span></h1>
            </div>
          </div>
          <div className="topbar__actions">
            <div className="traffic-status"><span className="traffic-dot" /> Live traffic</div>
            <button type="button" className="icon-button" aria-label="Notifications" onClick={() => toast.info("No new route alerts") }><Bell size={18} /></button>
            <button type="button" className="profile-button" onClick={() => toast.info("Profile settings are coming next") }><span>You</span><ChevronDown size={14} /></button>
          </div>
        </header>

        <section className="workspace">
          <div className="map-shell">
            <div className="map-surface">
              <div className={`map-fallback ${mapReady ? "map-fallback--hidden" : ""}`} aria-hidden="true">
                <div className="map-grid map-grid--vertical" />
                <div className="map-grid map-grid--horizontal" />
                <div className="map-river" />
                <div className="map-road map-road--one" />
                <div className="map-road map-road--two" />
                <div className="map-road map-road--three" />
                <div className="map-road map-road--four" />
                <span className="map-street street--one">Main road</span>
                <span className="map-street street--two">Market Street</span>
                <span className="map-street street--three">Baxter Ave</span>
                <span className="map-street street--four">Juniper Loop</span>
                <div className="map-park map-park--one">Riverside Park</div>
                <div className="map-park map-park--two">North Commons</div>
              </div>
              <MapView
                className="absolute inset-0 z-[1] !h-full"
                initialCenter={{ lat: 37.7817, lng: -122.4071 }}
                initialZoom={13}
                onMapReady={map => {
                  mapRef.current = map;
                  setMapReady(true);
                  const trafficLayer = new google.maps.TrafficLayer();
                  trafficLayer.setMap(map);
                }}
              />

              {locationPromptOpen && (
                <div className="location-permission-card">
                  <div className="location-permission-card__icon"><Crosshair size={18} /></div>
                  <div className="location-permission-card__copy"><strong>Use your location</strong><span>{locationStatus === "denied" ? "Location access was blocked. You can try again or continue with the map." : locationStatus === "unavailable" ? "Your browser could not provide a location. You can continue with the map." : "Motion uses your location to show the right traffic and route context."}</span></div>
                  <div className="location-permission-card__actions"><button type="button" className="location-use-button" onClick={requestLocation} disabled={locationStatus === "requesting"}>{locationStatus === "requesting" ? "Finding you…" : "Allow location"}</button><button type="button" className="location-skip-button" onClick={() => setLocationPromptOpen(false)}>Not now</button></div>
                </div>
              )}

              <div className="map-topbar">
                <div className="traffic-summary"><span className="traffic-dot" /> Moderate traffic <span className="summary-divider" /> <span>+6 min</span></div>
                <button type="button" className="map-layer-button" onClick={() => toast.info("Traffic, transit, and satellite layers are available") }><Layers3 size={16} /> Layers</button>
              </div>

              <div className="search-card">
                <div className="search-row">
                  <Search size={18} className="search-row__icon" />
                  <input
                    value={query}
                    onFocus={() => setSearchOpen(true)}
                    onChange={event => { setQuery(event.target.value); setSearchOpen(true); }}
                    onKeyDown={event => { if (event.key === "Enter" && query.trim()) selectDestination(query.trim()); }}
                    placeholder="Where to?"
                    aria-label="Search places and addresses"
                  />
                  <button type="button" className={`voice-button ${voiceActive ? "is-listening" : ""}`} onClick={handleVoice} aria-label="Voice search">
                    {voiceActive ? <Volume2 size={18} /> : <Mic size={18} />}
                  </button>
                </div>
                <div className="search-assist"><Sparkles size={14} /> {assistantNote}</div>
                {searchOpen && (
                  <div className="search-suggestions">
                    <div className="suggestions-heading"><span>Suggested for you</span><button type="button" onClick={() => setSearchOpen(false)} aria-label="Close suggestions"><X size={15} /></button></div>
                    {filteredSuggestions.length ? filteredSuggestions.map(item => {
                      const Icon = item.icon;
                      return (
                        <button type="button" key={item.name} className="suggestion-row" onClick={() => selectDestination(item.name)}>
                          <span className={`suggestion-icon suggestion-icon--${item.accent}`}><Icon size={16} /></span>
                          <span><strong>{item.name}</strong><small>{item.detail}</small></span>
                          <ArrowUpRight size={16} />
                        </button>
                      );
                    }) : <button type="button" className="suggestion-row" onClick={() => selectDestination(query)}><span className="suggestion-icon suggestion-icon--blue"><MapPin size={16} /></span><span><strong>Search for “{query}”</strong><small>Use Gemini to find the best match</small></span><ArrowUpRight size={16} /></button>}
                  </div>
                )}
              </div>

              <div className="map-controls">
                <button type="button" onClick={() => toast.info("Map centered on your current location")} aria-label="Center map"><Crosshair size={17} /></button>
                <div className="map-control-divider" />
                <button type="button" onClick={() => toast.info("Zoom in")} aria-label="Zoom in"><Plus size={17} /></button>
                <button type="button" onClick={() => toast.info("Zoom out")} aria-label="Zoom out"><span className="minus-icon" /></button>
                <button type="button" onClick={() => toast.info("Compass heading reset")} aria-label="Compass"><Compass size={17} /></button>
              </div>

              <div className="map-current-location"><span className="location-pulse" /><span>You are here</span></div>

              <div className="route-card">
                <div className="route-card__heading"><div><span className="route-kicker">Fastest route</span><strong>To {routeDestination}</strong></div><div className="route-eta"><b>{activePlace.eta}</b><span>{activePlace.distance}</span></div></div>
                <div className="route-card__meter"><span style={{ width: "68%" }} /><i /></div>
                <div className="route-card__meta"><span><Clock3 size={14} /> ETA updates with traffic</span><span className="route-good"><ArrowDownRight size={14} /> Live route</span></div>
                <button type="button" className="route-start" onClick={() => routeDestination === "a destination" ? toast.info("Search for a place first to preview a route") : toast.success(`Route preview ready for ${routeDestination}`)}><Navigation size={16} fill="currentColor" /> Preview route</button>
              </div>

              <button type="button" className="report-fab" onClick={() => setReportOpen(true)}><AlertTriangle size={16} /><span>Report something</span><span className="report-fab__shortcut">R</span></button>
            </div>
          </div>

          <aside className="right-panel">
            <div className="panel-heading"><div><span className="eyebrow">Your day</span><h2>Plan the next move</h2></div><button type="button" className="panel-more" onClick={() => toast.info("More trip planning tools are coming next")}><span /><span /><span /></button></div>

            <div className="smart-route-card">
              <div className="smart-route-card__top"><div className="smart-route-icon"><Zap size={17} fill="currentColor" /></div><span>Smart route</span><span className="smart-route-live">LIVE</span></div>
              <strong>Add a destination to get moving</strong>
              <p>Search for a place or save Home and Work to see an accurate route.</p>
              <div className="route-mini-bar"><span /><span /><span /><span /><span /></div>
              <div className="smart-route-card__footer"><span><Gauge size={14} /> Ready when you are</span><span>Live traffic on</span></div>
            </div>

            <div className="saved-section">
              <div className="section-heading"><h3>Quick destinations</h3><button type="button" onClick={() => toast.info("Add a saved place from the search bar")}><Plus size={16} /> Add</button></div>
              <div className="saved-tabs" role="tablist" aria-label="Saved destinations">
                {(["home", "work", "favorites"] as SavedTab[]).map(tab => <button type="button" key={tab} className={savedTab === tab ? "is-selected" : ""} onClick={() => setSavedTab(tab)} role="tab" aria-selected={savedTab === tab}>{tab === "home" ? <HomeIcon size={15} /> : tab === "work" ? <BriefcaseBusiness size={15} /> : <Heart size={15} />}<span>{tab === "favorites" ? "Favorites" : tab[0].toUpperCase() + tab.slice(1)}</span></button>)}
              </div>
              <button type="button" className="saved-place" onClick={() => activePlace.address.startsWith("Add") || activePlace.address.startsWith("Save") ? toast.info(`Search for an address to set ${activePlace.title}`) : selectDestination(activePlace.title)}><span className="saved-place__icon"><MapPin size={17} /></span><span><strong>{activePlace.title}</strong><small>{activePlace.address}</small></span><span className="saved-place__eta"><b>{activePlace.eta}</b><small>{activePlace.distance}</small></span></button>
            </div>

            <div className="incident-card">
              <div className="incident-card__header"><span className="incident-card__icon"><ShieldAlert size={16} /></span><div><span className="eyebrow">Driver reports</span><strong>No nearby reports yet</strong></div></div>
              <p>Reports from drivers will appear here as you move.</p>
              <div className="incident-card__actions"><button type="button" onClick={() => setReportOpen(true)}><Flag size={15} /> Add a report</button></div>
            </div>

            <div className="priority-card"><div className="priority-card__top"><span className="priority-badge">3</span><div><strong>Priority lane</strong><small>Be considerate, keep moving</small></div><Volume2 size={16} /></div><p>Drivers with a lower priority number may request a pass. Motion will say: <em>“Let the white Tesla behind you pass.”</em></p><button type="button" onClick={() => setReportOpen(true)}>Set your driving priority <ArrowUpRight size={15} /></button></div>
          </aside>
        </section>
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation"><button type="button" className="is-active"><Map size={18} /><span>Map</span></button><button type="button" onClick={() => toast.info("Saved places are in the right panel")}><Bookmark size={18} /><span>Saved</span></button><button type="button" onClick={() => setReportOpen(true)}><AlertTriangle size={18} /><span>Report</span></button><button type="button" onClick={handleVoice} className={voiceActive ? "is-listening" : ""}><Mic size={18} /><span>Voice</span></button></nav>

      {reportOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Report an incident">
          <div className="report-modal"><div className="modal-heading"><div><span className="eyebrow">Driver report</span><h2>What’s happening ahead?</h2></div><button type="button" className="icon-button" onClick={() => setReportOpen(false)} aria-label="Close report dialog"><X size={18} /></button></div>
            <div className="report-options">{reportOptions.map(option => { const Icon = option.icon; return <button type="button" key={option.value} className={reportType === option.value ? "is-selected" : ""} onClick={() => setReportType(option.value)}><Icon size={18} /><span>{option.label}</span>{reportType === option.value && <Check size={15} />}</button>; })}</div>
            <label className="field-label">Priority for this trip <span>Lower number gets the pass request first</span></label>
            <div className="priority-options">{priorityOptions.map(option => <button type="button" key={option.value} className={priority === option.value ? "is-selected" : ""} onClick={() => setPriority(option.value)}><span className="priority-option-number" style={{ background: option.color }}>{option.value}</span><span><strong>{option.label}</strong><small>{option.caption}</small></span></button>)}</div>
            <label className="field-label" htmlFor="report-note">Add a note <span>Optional</span></label><textarea id="report-note" value={reportNote} onChange={event => setReportNote(event.target.value)} placeholder="e.g. blocking the right lane" rows={2} />
            <div className="modal-footer"><span><MapPin size={14} /> Current map location</span><button type="button" className="route-start" onClick={submitDriverReport} disabled={submitReport.isPending}><Flag size={16} /> {submitReport.isPending ? "Sharing…" : "Share report"}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
