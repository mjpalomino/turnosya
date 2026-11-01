/** Modelos compartidos del frontend (reflejan las respuestas del API). */

export type Role = 'superadmin' | 'owner' | 'staff' | 'customer';

export interface AuthUser {
  id: string;
  role: Role;
  tenantId: string | null;
  email: string | null;
  fullName: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
  slug?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  priceCop: number;
  isActive?: boolean;
}

export interface CategoryRef { slug: string; name: string; icon: string; }

export interface PublicSite {
  name: string;
  timezone: string;
  city?: string | null;
  tagline?: string | null;
  location?: { lat: number; lng: number } | null;
  category?: CategoryRef | null;
  rating?: number | null;
  reviews?: number;
  branding: {
    logoUrl?: string | null;
    coverUrl?: string | null;
    primaryColor: string;
    secondaryColor: string;
    phone?: string | null;
    whatsappNumber?: string | null;
    email?: string | null;
    address?: string | null;
    about?: string | null;
    instagram?: string | null;
    website?: string | null;
    facebook?: string | null;
    tiktok?: string | null;
    openingHours?: string | null;
  } | null;
  services: Service[];
  staff?: { id: string; fullName: string; title?: string | null; photoUrl?: string | null }[];
  onlinePayment?: { enabled: boolean; chargeMode?: 'full' | 'deposit'; depositPct?: number };
}

/** Categoría (tipo de negocio) del directorio. */
export interface Category { id: string; slug: string; name: string; icon: string; count: number; }

/** Tarjeta de negocio en el directorio público. */
export interface DirectoryBusiness {
  slug: string;
  name: string;
  city: string | null;
  tagline: string | null;
  address: string | null;
  about: string | null;
  category: CategoryRef | null;
  logoUrl: string | null;
  coverUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  rating: number | null;
  reviews: number;
  servicesCount: number;
  minPrice: number | null;
  hasLocation: boolean;
  distanceKm: number | null;
  hasWhatsapp: boolean;
}

export interface DirectoryPage { total: number; items: DirectoryBusiness[]; }

/** Marca de la plataforma (definida por el superadmin). */
export interface PlatformBranding {
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  tagline: string | null;
}

export interface AvailabilityOption {
  staffId: string;
  slots: string[];
}

export interface Availability {
  date: string;
  duration: number;
  options: AvailabilityOption[];
}

export interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'booked' | 'confirmed' | 'completed' | 'no_show' | 'cancelled';
  serviceName: string;
  staffName?: string;
  customerName?: string;
  customerPhone?: string;
  businessName?: string;
  businessSlug?: string;
  paymentStatus?: 'none' | 'pending' | 'paid';
  priceCop?: number;
  canPay?: boolean;
}

export interface LoyaltyCard {
  tenantId?: string;
  businessName?: string;
  businessSlug?: string;
  enabled: boolean;
  stickers: number;
  rewardsEarned: number;
  threshold: number;
  rewardLabel: string;
}

export interface Plan {
  id: string;
  name: string;
  description?: string | null;
  discountQuarterlyPct?: number;
  discountSemiannualPct?: number;
  subscribers?: number;
  priceCop: number;
  maxStaff: number;
  maxBranches: number;
  maxServices: number;
  features: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended';
  subStatus?: string;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  planName?: string;
  categoryName?: string | null;
  city?: string | null;
  isListed?: boolean;
}

/** Datos de contacto del sitio principal (superadmin). */
export interface PlatformContact {
  email?: string | null; phone?: string | null; whatsapp?: string | null;
  address?: string | null; city?: string | null; supportHours?: string | null;
  instagram?: string | null; facebook?: string | null; tiktok?: string | null; website?: string | null;
}

export type BillingCycle = 1 | 3 | 6;

export interface FeatureDef { key: string; label: string; }

export interface DiscountLine { kind: string; label: string; pct: number; amountCop: number; }

export interface PriceQuote {
  months: BillingCycle; monthlyPriceCop: number; baseCop: number;
  discounts: DiscountLine[]; discountCop: number; totalCop: number; effectiveMonthlyCop: number;
  planId?: string; planName?: string; cycleLabel?: string;
}

/** Respuesta de checkout firmada para abrir Wompi Web Checkout. */
export interface WompiCheckout {
  publicKey: string; currency: string; amountInCents: number; reference: string;
  signatureIntegrity: string | null; redirectUrl: string; customerEmail?: string | null;
}

export const CYCLE_OPTIONS: { months: BillingCycle; label: string }[] = [
  { months: 1, label: 'Mensual' },
  { months: 3, label: 'Trimestral' },
  { months: 6, label: 'Semestral' },
];
