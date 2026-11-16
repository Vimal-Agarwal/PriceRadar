import { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard, Settings, LogOut,
  TrendingDown, TrendingUp, Plus, Search, Moon, Sun,
  Pause, Play, Trash2, ExternalLink, X, Eye, EyeOff,
  ArrowLeft, AlertTriangle, CheckCircle2, Clock,
  RefreshCw, BarChart2, Zap, ShoppingBag, Activity,
  Bell, Package,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Toaster, toast } from "sonner";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { authApi, productsApi } from "../api/endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "auth" | "dashboard" | "detail" | "settings";
type AuthMode = "login" | "register";
type TimeRange = "1W" | "1M" | "3M" | "ALL";

interface Product {
  id: number;
  nickname: string;
  title: string;
  url: string;
  image: string;
  currency: string;
  currentPrice: number;
  previousPrice: number;
  lowestPrice: number;
  highestPrice: number;
  targetPrice: number;
  isAvailable: boolean;
  trackingEnabled: boolean;
  lastScrapedAt: Date;
  scrapeError: string | null;
}

interface PricePoint {
  date: string;
  price: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Maps the backend's snake_case ProductOut response to the UI's Product shape.
function mapProduct(p: any): Product {
  return {
    id: p.id,
    nickname: p.nickname || p.title || "Untitled product",
    title: p.title || "Fetching product info… first scrape in progress.",
    url: p.url,
    image: p.image || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop&auto=format",
    currency: p.currency || "₹",
    currentPrice: p.current_price ?? 0,
    previousPrice: p.previous_price ?? p.current_price ?? 0,
    lowestPrice: p.lowest_price ?? p.current_price ?? 0,
    highestPrice: p.highest_price ?? p.current_price ?? 0,
    targetPrice: p.target_price,
    isAvailable: p.is_available,
    trackingEnabled: p.tracking_enabled,
    lastScrapedAt: p.last_scraped_at ? new Date(p.last_scraped_at) : new Date(p.created_at),
    scrapeError: p.scrape_error,
  };
}

// Maps one row of the backend's /products/{id}/history response to a chart point.
function mapHistoryRow(h: { price: number; scraped_at: string }): PricePoint & { raw: Date } {
  const raw = new Date(h.scraped_at);
  return { date: format(raw, "MMM d"), price: h.price, raw };
}

function fmt(currency: string, price: number): string {
  return currency === "₹"
    ? `₹${price.toLocaleString("en-IN")}`
    : `${currency}${price.toLocaleString()}`;
}

function diff(current: number, previous: number) {
  const d = current - previous;
  const pct = ((d / previous) * 100).toFixed(1);
  return { d, pct, isDown: d < 0 };
}

// ─── AuthPage ─────────────────────────────────────────────────────────────────

function AuthPage({ onAuth }: { onAuth: (mode: AuthMode, form: { name: string; email: string; password: string }) => Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onAuth(mode, form);
      toast.success(mode === "login" ? "Welcome back!" : "Account created successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[440px] bg-card border-r border-border p-12 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground text-xl tracking-tight">PriceWatch</span>
        </div>

        <div>
          <p className="text-xs font-mono text-primary mb-4 tracking-widest uppercase">Price Intelligence Platform</p>
          <h1 className="text-5xl font-extrabold text-foreground leading-[1.1] mb-6">
            Track prices.<br />
            Buy at the<br />
            right moment.
          </h1>
          <p className="text-muted-foreground text-base leading-relaxed">
            Hourly price monitoring across Amazon, Flipkart, and more.
            Get alerted the instant a price drops below your target.
          </p>
        </div>

        <div className="space-y-3">
          {[
            { icon: Clock, text: "Hourly scraping — flash sales last only hours" },
            { icon: Bell, text: "Smart alerts — no spam, only meaningful drops" },
            { icon: BarChart2, text: "Full price history with interactive charts" },
            { icon: CheckCircle2, text: "Edge case handling: OOS, CAPTCHA, redirects" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground text-lg">PriceWatch</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-1">
              {mode === "login" ? "Sign in" : "Create account"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {mode === "login" ? "Good to have you back." : "Start tracking in under a minute."}
            </p>
          </div>

          <div className="flex bg-muted rounded-xl p-1 mb-7">
            {(["login", "register"] as AuthMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm rounded-lg font-semibold transition-all ${mode === m
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
                  }`}
              >
                {m === "login" ? "Sign In" : "Register"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Arjun Sharma"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="arjun@example.com"
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-sm pr-12"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === "login" && (
              <div className="flex justify-end">
                <button type="button" className="text-xs text-primary hover:underline font-medium">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 mt-1"
            >
              {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Hourly tracking starts the moment you add a product
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  view,
  setView,
  onLogout,
  alertCount,
}: {
  view: View;
  setView: (v: View) => void;
  onLogout: () => void;
  alertCount: number;
}) {
  const nav = [
    { id: "dashboard" as View, icon: LayoutDashboard, label: "Dashboard" },
    { id: "settings" as View, icon: Settings, label: "Settings" },
  ];

  return (
    <aside className="w-60 h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 z-40">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-extrabold text-foreground tracking-tight">PriceWatch</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${view === id || (view === "detail" && id === "dashboard")
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}

        <div className="pt-3 pb-1 px-3">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Alerts</p>
        </div>

        <button
          onClick={() => toast("No new alerts", { description: "All products are above target price." })}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
        >
          <Bell className="w-4 h-4" />
          Notifications
          {alertCount > 0 && (
            <span className="ml-auto bg-primary text-primary-foreground text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
              {alertCount}
            </span>
          )}
        </button>
      </nav>

      {/* Scheduler pulse */}
      <div className="mx-3 mb-3 p-3 bg-muted rounded-lg">
        <div className="flex items-center gap-2 mb-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
          </span>
          <span className="text-xs font-semibold text-foreground">Scheduler active</span>
        </div>
        <p className="text-xs text-muted-foreground font-mono">Next run in 23 min</p>
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary">AS</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">Arjun Sharma</p>
            <p className="text-xs text-muted-foreground truncate">arjun@example.com</p>
          </div>
          <button
            onClick={onLogout}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

function TopBar({
  title,
  isDark,
  setIsDark,
  onAdd,
  search,
  setSearch,
}: {
  title: string;
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  onAdd?: () => void;
  search?: string;
  setSearch?: (v: string) => void;
}) {
  return (
    <div className="h-14 bg-card border-b border-border flex items-center px-6 gap-4 sticky top-0 z-30">
      <h1 className="text-base font-bold text-foreground flex-1">{title}</h1>

      {setSearch !== undefined && (
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-4 py-2 bg-muted border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-52 transition-all"
          />
        </div>
      )}

      <button
        onClick={() => setIsDark(!isDark)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {onAdd && (
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 transition-opacity"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Product
        </button>
      )}
    </div>
  );
}

// ─── ProductCard ──────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onToggle,
  onDelete,
  onDetail,
}: {
  product: Product;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onDetail: (p: Product) => void;
}) {
  const { d, pct, isDown } = diff(product.currentPrice, product.previousPrice);
  const atTarget = product.currentPrice <= product.targetPrice;
  const pctAbove =
    ((product.currentPrice - product.targetPrice) / product.targetPrice) * 100;
  // Lightweight trend preview built from real summary stats already on the
  // product (avoids firing a history request per card just for a sparkline).
  const spark: PricePoint[] = useMemo(
    () => [
      { date: "low", price: product.lowestPrice },
      { date: "prev", price: product.previousPrice },
      { date: "now", price: product.currentPrice },
    ],
    [product.lowestPrice, product.previousPrice, product.currentPrice]
  );

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/25 transition-all group flex flex-col">
      {/* Image */}
      <div className="relative h-40 bg-muted overflow-hidden flex-shrink-0">
        <img
          src={product.image}
          alt={product.nickname}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-3 flex gap-1.5 flex-wrap">
          {!product.isAvailable && (
            <span className="px-2 py-0.5 bg-destructive text-destructive-foreground text-[10px] rounded-full font-bold">
              Out of Stock
            </span>
          )}
          {atTarget && (
            <span className="px-2 py-0.5 bg-accent text-accent-foreground text-[10px] rounded-full font-bold">
              Target Hit!
            </span>
          )}
          {product.scrapeError && (
            <span className="px-2 py-0.5 bg-yellow-500 text-black text-[10px] rounded-full font-bold">
              Error
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3">
          <span
            className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${product.trackingEnabled
              ? "bg-primary/25 text-primary backdrop-blur-sm"
              : "bg-black/40 text-white/60 backdrop-blur-sm"
              }`}
          >
            {product.trackingEnabled ? "Tracking" : "Paused"}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        {/* Name */}
        <div className="mb-3">
          <h3 className="font-bold text-foreground text-sm truncate">{product.nickname}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5 leading-relaxed">
            {product.title}
          </p>
        </div>

        {/* Price */}
        <div className="flex items-end gap-2 mb-3">
          <span className="text-2xl font-bold text-foreground font-mono leading-none">
            {fmt(product.currency, product.currentPrice)}
          </span>
          {d !== 0 && (
            <div
              className={`flex items-center gap-0.5 text-xs font-mono font-bold pb-0.5 ${isDown ? "text-accent" : "text-destructive"
                }`}
            >
              {isDown ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
              {isDown ? "" : "+"}
              {d.toLocaleString("en-IN")} ({isDown ? "" : "+"}
              {pct}%)
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div className="h-12 -mx-1 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <defs>
                <linearGradient id={`g${product.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isDown ? "#4ade80" : "#22d3ee"} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={isDown ? "#4ade80" : "#22d3ee"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="price"
                stroke={isDown ? "#4ade80" : "#22d3ee"}
                strokeWidth={1.5}
                fill={`url(#g${product.id})`}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div>
            <p className="text-muted-foreground mb-0.5">Lowest</p>
            <p className="font-mono font-bold text-accent">
              {fmt(product.currency, product.lowestPrice)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Highest</p>
            <p className="font-mono font-bold text-foreground">
              {fmt(product.currency, product.highestPrice)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground mb-0.5">Target</p>
            <p className={`font-mono font-bold ${atTarget ? "text-accent" : "text-foreground"}`}>
              {fmt(product.currency, product.targetPrice)}
            </p>
          </div>
        </div>

        {/* Progress to target */}
        {!atTarget && (
          <div className="mb-3">
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Progress to target</span>
              <span className="font-mono">{pctAbove.toFixed(1)}% above</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/40 rounded-full transition-all"
                style={{ width: `${Math.max(5, 100 - Math.min(100, pctAbove * 2))}%` }}
              />
            </div>
          </div>
        )}

        {/* Updated */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-4 mt-auto">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(product.lastScrapedAt, { addSuffix: true })}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onDetail(product)}
            className="flex-1 py-2 text-xs bg-muted text-foreground rounded-lg hover:bg-secondary transition-colors font-semibold"
          >
            View Details
          </button>
          <button
            onClick={() => onToggle(product.id)}
            className="w-8 h-8 flex items-center justify-center bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
            title={product.trackingEnabled ? "Pause" : "Resume"}
          >
            {product.trackingEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onDelete(product.id)}
            className="w-8 h-8 flex items-center justify-center bg-muted rounded-lg text-muted-foreground hover:text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DashboardPage ────────────────────────────────────────────────────────────

function DashboardPage({
  products,
  isDark,
  setIsDark,
  onToggle,
  onDelete,
  onDetail,
  onAdd,
  loading,
}: {
  products: Product[];
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onDetail: (p: Product) => void;
  onAdd: () => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = products.filter(
    (p) =>
      p.nickname.toLowerCase().includes(search.toLowerCase()) ||
      p.title.toLowerCase().includes(search.toLowerCase())
  );

  const stats = useMemo(
    () => ({
      total: products.length,
      tracking: products.filter((p) => p.trackingEnabled).length,
      atTarget: products.filter((p) => p.currentPrice <= p.targetPrice).length,
      outOfStock: products.filter((p) => !p.isAvailable).length,
    }),
    [products]
  );

  return (
    <>
      <TopBar
        title="Dashboard"
        isDark={isDark}
        setIsDark={setIsDark}
        onAdd={onAdd}
        search={search}
        setSearch={setSearch}
      />
      <div className="p-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {[
            { label: "Total Products", value: stats.total, icon: Package, color: "text-primary" },
            { label: "Actively Tracking", value: stats.tracking, icon: Activity, color: "text-accent" },
            { label: "At Target Price", value: stats.atTarget, icon: CheckCircle2, color: "text-green-400" },
            { label: "Out of Stock", value: stats.outOfStock, icon: AlertTriangle, color: "text-yellow-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-3xl font-extrabold text-foreground font-mono">{value}</p>
            </div>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-center py-24">
            <RefreshCw className="w-8 h-8 text-muted-foreground mx-auto mb-4 animate-spin" />
            <p className="text-sm text-muted-foreground font-medium">Loading your tracked products…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-medium">
              {search ? "No products match your search." : "No products yet. Add one to get started."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onToggle={onToggle}
                onDelete={onDelete}
                onDetail={onDetail}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── ProductDetailPage ────────────────────────────────────────────────────────

function ProductDetailPage({
  product,
  isDark,
  setIsDark,
  onBack,
  onToggle,
  onDelete,
  onRefresh,
}: {
  product: Product;
  isDark: boolean;
  setIsDark: (v: boolean) => void;
  onBack: () => void;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
  onRefresh: () => Promise<void>;
}) {
  const [range, setRange] = useState<TimeRange>("1M");
  const days = { "1W": 7, "1M": 30, "3M": 90, ALL: 180 }[range];
  const [fullHistory, setFullHistory] = useState<(PricePoint & { raw: Date })[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    productsApi
      .history(product.id, "all")
      .then((res) => {
        if (cancelled) return;
        setFullHistory(res.data.history.map(mapHistoryRow));
      })
      .catch(() => toast.error("Could not load price history"))
      .finally(() => !cancelled && setHistoryLoading(false));
    return () => {
      cancelled = true;
    };
  }, [product.id]);

  const cutoff = subDays(new Date(), days);
  const history = useMemo(
    () => fullHistory.filter((p) => p.raw >= cutoff),
    [fullHistory, days]
  );
  const avg = history.length
    ? Math.round(history.reduce((s, p) => s + p.price, 0) / history.length)
    : product.currentPrice;
  const { d, pct, isDown } = diff(product.currentPrice, product.previousPrice);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-2xl">
        <p className="text-[10px] text-muted-foreground mb-0.5">{label}</p>
        <p className="text-sm font-bold text-foreground font-mono">
          {fmt(product.currency, payload[0].value)}
        </p>
      </div>
    );
  };

  return (
    <>
      <TopBar title="Product Detail" isDark={isDark} setIsDark={setIsDark} />
      <div className="p-6 max-w-5xl mx-auto">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </button>

        {/* Header row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
          {/* Product info */}
          <div className="lg:col-span-2 bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex gap-5 p-5">
              <div className="w-24 h-24 bg-muted rounded-xl overflow-hidden flex-shrink-0">
                <img
                  src={product.image}
                  alt={product.nickname}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 mb-1.5">
                  <h2 className="font-extrabold text-foreground text-lg leading-tight flex-1">
                    {product.nickname}
                  </h2>
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0 mt-0.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed line-clamp-2">
                  {product.title}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${product.isAvailable
                      ? "bg-accent/15 text-accent"
                      : "bg-destructive/15 text-destructive"
                      }`}
                  >
                    {product.isAvailable ? "In Stock" : "Out of Stock"}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] rounded-full font-bold ${product.trackingEnabled
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                      }`}
                  >
                    {product.trackingEnabled ? "Tracking Active" : "Paused"}
                  </span>
                  {product.scrapeError && (
                    <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-yellow-500/20 text-yellow-400">
                      Scrape Error
                    </span>
                  )}
                </div>
                {product.scrapeError && (
                  <p className="text-[10px] text-yellow-400/80 mt-2 font-mono">{product.scrapeError}</p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Actions</p>
            <div className="space-y-2">
              <button
                onClick={() => onToggle(product.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                {product.trackingEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {product.trackingEnabled ? "Pause Tracking" : "Resume Tracking"}
              </button>
              <button
                onClick={async () => {
                  setScraping(true);
                  try {
                    await productsApi.runNow();
                    await onRefresh();
                    toast.success("Scrape cycle completed — prices updated");
                  } catch {
                    toast.error("Scrape cycle failed. Try again in a bit.");
                  } finally {
                    setScraping(false);
                  }
                }}
                disabled={scraping}
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted rounded-xl text-sm font-semibold text-foreground hover:bg-secondary transition-colors disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${scraping ? "animate-spin" : ""}`} />
                {scraping ? "Scraping…" : "Force Scrape Now"}
              </button>
              <button
                onClick={() => {
                  onDelete(product.id);
                  onBack();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 bg-destructive/10 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Product
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Current", value: product.currentPrice, extra: d !== 0 ? `${isDown ? "↓" : "↑"} ${pct}%` : null, extraColor: isDown ? "text-accent" : "text-destructive" },
            { label: "Previous", value: product.previousPrice },
            { label: "Lowest Ever", value: product.lowestPrice, color: "text-accent" },
            { label: "Highest Ever", value: product.highestPrice, color: "text-destructive" },
            { label: "Target", value: product.targetPrice, color: product.currentPrice <= product.targetPrice ? "text-accent" : "text-muted-foreground" },
          ].map(({ label, value, color, extra, extraColor }) => (
            <div key={label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">{label}</p>
              <p className={`text-lg font-extrabold font-mono ${color || "text-foreground"}`}>
                {fmt(product.currency, value)}
              </p>
              {extra && <p className={`text-[10px] font-mono font-bold mt-0.5 ${extraColor}`}>{extra}</p>}
            </div>
          ))}
        </div>

        {/* Chart */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-foreground text-sm">Price History</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Avg:{" "}
                <span className="font-mono text-foreground font-semibold">{fmt(product.currency, avg)}</span>
              </p>
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(["1W", "1M", "3M", "ALL"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-xs rounded-md font-bold transition-all ${range === r
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="h-60">
            {historyLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-mono">
                Loading price history…
              </div>
            ) : history.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-mono text-center px-6">
                No price history yet for this range — the hourly scraper hasn't run enough times. Try "Force Scrape Now".
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 5, bottom: 5, left: 10 }}>
                  <defs>
                    <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "#64647a", fontFamily: "JetBrains Mono" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#64647a", fontFamily: "JetBrains Mono" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      v >= 100000
                        ? `₹${(v / 100000).toFixed(1)}L`
                        : v >= 1000
                          ? `₹${(v / 1000).toFixed(0)}k`
                          : `₹${v}`
                    }
                    width={52}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine
                    y={product.targetPrice}
                    stroke="#4ade80"
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                      value: "Target",
                      fill: "#4ade80",
                      fontSize: 9,
                      fontFamily: "JetBrains Mono",
                      position: "insideTopRight",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    stroke="#22d3ee"
                    strokeWidth={2}
                    fill="url(#chartGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "#22d3ee", stroke: "#0b0b0f", strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Recent history table */}
        <div className="mt-5 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-bold text-foreground text-sm">Recent Price Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-muted-foreground font-semibold uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-right text-muted-foreground font-semibold uppercase tracking-wider">Change</th>
                  <th className="px-6 py-3 text-center text-muted-foreground font-semibold uppercase tracking-wider">Available</th>
                </tr>
              </thead>
              <tbody>
                {history
                  .slice(-10)
                  .reverse()
                  .map((row, i, arr) => {
                    const prev = arr[i + 1];
                    const change = prev ? row.price - prev.price : 0;
                    return (
                      <tr key={row.date} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-3 text-muted-foreground font-mono">{row.date}</td>
                        <td className="px-6 py-3 text-right text-foreground font-mono font-semibold">
                          {fmt(product.currency, row.price)}
                        </td>
                        <td className={`px-6 py-3 text-right font-mono font-semibold ${change < 0 ? "text-accent" : change > 0 ? "text-destructive" : "text-muted-foreground"
                          }`}>
                          {change === 0 ? "—" : `${change > 0 ? "+" : ""}${change.toLocaleString("en-IN")}`}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${i < 2 ? "bg-accent" : "bg-muted-foreground/40"
                            }`} />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── AddProductModal ──────────────────────────────────────────────────────────

function AddProductModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (form: { url: string; nickname: string; targetPrice: string }) => Promise<void>;
}) {
  const [form, setForm] = useState({ url: "", nickname: "", targetPrice: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.startsWith("http")) {
      toast.error("Please enter a valid URL starting with https://");
      return;
    }
    if (!form.targetPrice || Number(form.targetPrice) <= 0) {
      toast.error("Please enter a target price greater than 0");
      return;
    }
    setLoading(true);
    try {
      await onAdd(form);
      toast.success("Product added! First scrape will run shortly.");
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Could not add product");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">Add Product</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Paste a product URL to start tracking</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">
              Product URL <span className="text-destructive">*</span>
            </label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://amazon.in/dp/..."
              className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              required
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Supports Amazon, Flipkart, Myntra, Meesho, and more
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">Nickname</label>
            <input
              type="text"
              value={form.nickname}
              onChange={(e) => setForm({ ...form, nickname: e.target.value })}
              placeholder="e.g. Sony Headphones"
              className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-foreground mb-1.5 uppercase tracking-wider">
              Target Price <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-mono">
                ₹
              </span>
              <input
                type="number"
                value={form.targetPrice}
                onChange={(e) => setForm({ ...form, targetPrice: e.target.value })}
                placeholder="20000"
                className="w-full pl-8 pr-4 py-3 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all font-mono"
                min={1}
                required
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              You'll get an email when price drops below this
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-muted text-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {loading ? "Fetching..." : "Start Tracking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── SettingsPage ─────────────────────────────────────────────────────────────

function SettingsPage({
  isDark,
  setIsDark,
}: {
  isDark: boolean;
  setIsDark: (v: boolean) => void;
}) {
  const [alerts, setAlerts] = useState({
    priceDrop: true,
    backInStock: true,
    outOfStock: false,
    scrapeError: false,
  });
  const [interval, setInterval] = useState("1");

  return (
    <>
      <TopBar title="Settings" isDark={isDark} setIsDark={setIsDark} />
      <div className="p-6 max-w-2xl space-y-5">
        {/* Profile */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground text-sm mb-5">Profile</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                defaultValue="Arjun Sharma"
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                defaultValue="arjun@example.com"
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <input
                type="password"
                placeholder="Leave blank to keep current"
                className="w-full px-4 py-3 bg-muted border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => toast.success("Profile updated!")}
              className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Save Changes
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground text-sm mb-1">Email Notifications</h3>
          <p className="text-xs text-muted-foreground mb-5">Choose when to receive alerts</p>
          <div className="space-y-0">
            {[
              {
                key: "priceDrop",
                label: "Price drops below target",
                desc: "Instant alert when a tracked product hits your target price",
              },
              {
                key: "backInStock",
                label: "Product back in stock",
                desc: "Notify when an out-of-stock product becomes available again",
              },
              {
                key: "outOfStock",
                label: "Product goes out of stock",
                desc: "Alert when a tracked product becomes unavailable",
              },
              {
                key: "scrapeError",
                label: "Scraping errors",
                desc: "Notify when a product page repeatedly fails to fetch",
              },
            ].map(({ key, label, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between py-4 border-b border-border last:border-0"
              >
                <div className="flex-1 pr-4">
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() =>
                    setAlerts((a) => ({
                      ...a,
                      [key]: !a[key as keyof typeof a],
                    }))
                  }
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${alerts[key as keyof typeof alerts] ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                >
                  <div
                    className={`absolute w-3.5 h-3.5 bg-white rounded-full top-[3px] transition-transform shadow-sm ${alerts[key as keyof typeof alerts] ? "translate-x-[22px]" : "translate-x-[3px]"
                      }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Scraping interval */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground text-sm mb-1">Scraping Interval</h3>
          <p className="text-xs text-muted-foreground mb-5">
            How often to check for price changes. Shorter = more accurate.
          </p>
          <div className="flex gap-2 flex-wrap">
            {["1", "2", "4", "6"].map((h) => (
              <button
                key={h}
                onClick={() => setInterval(h)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${interval === h
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
              >
                Every {h}h
              </button>
            ))}
          </div>
          <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-xl">
            <p className="text-xs text-primary font-semibold">
              Recommended: Every 1 hour
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Flash sales can appear and expire within 2 hours. Hourly scraping ensures you never miss a ₹350 → ₹500 spike.
            </p>
          </div>
        </div>

        {/* Smart Alert Logic */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="font-bold text-foreground text-sm mb-1">Smart Alert Logic</h3>
          <p className="text-xs text-muted-foreground mb-4">How alerts are deduplicated</p>
          <div className="space-y-2 font-mono text-xs">
            {[
              { price: "₹500", label: "Above target", color: "text-muted-foreground" },
              { price: "₹350", label: "Alert sent ✓", color: "text-accent" },
              { price: "₹450", label: "No alert (above ₹350)", color: "text-muted-foreground" },
              { price: "₹380", label: "No alert (above ₹350)", color: "text-muted-foreground" },
              { price: "₹300", label: "Alert sent ✓", color: "text-accent" },
            ].map(({ price, label, color }, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-16 text-right text-foreground font-bold">{price}</span>
                <span className="text-muted-foreground">→</span>
                <span className={color}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-card border border-destructive/25 rounded-2xl p-6">
          <h3 className="font-bold text-foreground text-sm mb-1">Danger Zone</h3>
          <p className="text-xs text-muted-foreground mb-5">These actions are irreversible</p>
          <div className="flex gap-3">
            <button
              onClick={() => toast.info("Export feature coming soon")}
              className="px-4 py-2.5 bg-muted text-sm text-foreground rounded-xl font-bold hover:bg-secondary transition-colors"
            >
              Export All Data
            </button>
            <button
              onClick={() => toast.error("Account deletion requires email confirmation")}
              className="px-4 py-2.5 bg-destructive/10 text-sm text-destructive rounded-xl font-bold hover:bg-destructive/20 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("access_token")
  );
  const [view, setView] = useState<View>(token ? "dashboard" : "auth");
  const [isDark, setIsDark] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const selected = products.find((p) => p.id === selectedId) || null;

  const refreshProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await productsApi.list();
      setProducts(res.data.map(mapProduct));
    } catch {
      toast.error("Could not load your tracked products");
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (token) refreshProducts();
  }, [token]);

  // Auto-refresh every 10 seconds to show scraped prices
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      refreshProducts();
    }, 10000);
    return () => clearInterval(interval);
  }, [token]);

  const handleAuth = async (
    mode: AuthMode,
    form: { name: string; email: string; password: string }
  ) => {
    if (mode === "register") {
      await authApi.register({ name: form.name, email: form.email, password: form.password });
    }
    const res = await authApi.login({ email: form.email, password: form.password });
    localStorage.setItem("access_token", res.data.access_token);
    setToken(res.data.access_token);
    setView("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    setToken(null);
    setProducts([]);
    setView("auth");
  };

  const handleToggle = async (id: number) => {
    const current = products.find((p) => p.id === id);
    if (!current) return;
    try {
      const res = await productsApi.update(id, { tracking_enabled: !current.trackingEnabled });
      const updated = mapProduct(res.data);
      setProducts((ps) => ps.map((p) => (p.id === id ? updated : p)));
      toast.success(
        updated.trackingEnabled
          ? `Tracking resumed for ${updated.nickname}`
          : `Tracking paused for ${updated.nickname}`
      );
    } catch {
      toast.error("Could not update tracking status");
    }
  };

  const handleDelete = async (id: number) => {
    const p = products.find((x) => x.id === id);
    try {
      await productsApi.remove(id);
      setProducts((ps) => ps.filter((x) => x.id !== id));
      toast.success(`${p?.nickname} removed`);
    } catch {
      toast.error("Could not delete product");
    }
  };

  const handleAddProduct = async (form: {
    url: string;
    nickname: string;
    targetPrice: string;
  }) => {
    const res = await productsApi.create({
      url: form.url,
      nickname: form.nickname || undefined,
      target_price: Number(form.targetPrice),
    });
    setProducts((ps) => [mapProduct(res.data), ...ps]);
  };

  const handleDetail = (p: Product) => {
    setSelectedId(p.id);
    setView("detail");
  };

  const alertCount = products.filter((p) => p.currentPrice <= p.targetPrice).length;

  if (view === "auth") {
    return (
      <div className={isDark ? "dark" : ""}>
        <Toaster richColors position="top-right" />
        <AuthPage onAuth={handleAuth} />
      </div>
    );
  }

  return (
    <div className={isDark ? "dark" : ""}>
      <Toaster richColors position="top-right" />
      <div className="min-h-screen bg-background flex">
        <Sidebar
          view={view}
          setView={setView}
          onLogout={handleLogout}
          alertCount={alertCount}
        />

        <main className="flex-1 ml-60 min-h-screen overflow-y-auto">
          {view === "dashboard" && (
            <DashboardPage
              products={products}
              isDark={isDark}
              setIsDark={setIsDark}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onDetail={handleDetail}
              onAdd={() => setShowAdd(true)}
              loading={loadingProducts}
            />
          )}
          {view === "detail" && selected && (
            <ProductDetailPage
              product={selected}
              isDark={isDark}
              setIsDark={setIsDark}
              onBack={() => setView("dashboard")}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onRefresh={refreshProducts}
            />
          )}
          {view === "settings" && (
            <SettingsPage isDark={isDark} setIsDark={setIsDark} />
          )}
        </main>
      </div>

      {showAdd && (
        <AddProductModal onClose={() => setShowAdd(false)} onAdd={handleAddProduct} />
      )}
    </div>
  );
}
